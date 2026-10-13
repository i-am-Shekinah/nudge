import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { CLASSIFICATION_SYSTEM_PROMPT } from './ai.prompt.js';
import {
  AiBatchOutputSchema,
  AiClassifiedEvent,
  isValidDetectedEvent,
} from './ai.schema.js';
import { EmailDto } from '../gmail/gmail.types.js';

/**
 * Google signals hard quota exhaustion (free-tier daily cap) with
 * RESOURCE_EXHAUSTED and retry delays measured in hours.
 */
export function isQuotaExhaustedError(err: any): boolean {
  const text = String(err?.message ?? err?.status ?? '');
  return /RESOURCE_EXHAUSTED|exceeded your current quota/i.test(text);
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiClient: GoogleGenAI | null = null;
  private readonly apiKey: string | null;
  private readonly model: string;
  private readonly confidenceThreshold: number;
  // 3 attempts total: immediate, +2s, +8s — rides out a 503 load-shed burst
  private readonly retryDelaysMs = [2_000, 8_000];
  /**
   * Emails per Gemini call. 20 balances quota/cost against the model's max
   * output tokens and batch attention quality; capped at 30 deliberately.
   */
  readonly batchSize: number;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') || null;
    // Model names get retired by Google; keep it swappable without a code change
    this.model =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-3.8-flash';
    const threshold = Number(
      this.configService.get<string>('AI_CONFIDENCE_THRESHOLD'),
    );
    this.confidenceThreshold =
      Number.isFinite(threshold) && threshold > 0 && threshold <= 1
        ? threshold
        : 0.75;
    const batchSize = Number(this.configService.get<string>('AI_BATCH_SIZE'));
    this.batchSize = Number.isFinite(batchSize) && batchSize >= 1
      ? Math.min(batchSize, 30)
      : 20;

    if (this.apiKey) {
      this.aiClient = new GoogleGenAI({ apiKey: this.apiKey });
    } else {
      this.logger.warn(
        'GEMINI_API_KEY not configured. Running in mock AI classification mode.',
      );
    }
  }

  /**
   * Classifies a batch of emails in ONE Gemini call (quota/cost efficiency).
   * Returns a map emailId -> event (null = classified, not actionable).
   * API/parse errors are NOT swallowed: the scanner needs to tell "no event"
   * apart from "AI unreachable" so a systematic outage fails the scan and
   * holds the cursor instead of silently burning the window.
   */
  async classifyEmailBatch(
    emails: EmailDto[],
    userTimezone: string = 'UTC',
  ): Promise<Map<string, AiClassifiedEvent | null>> {
    if (emails.length === 0) return new Map();

    if (!this.aiClient) {
      return new Map(
        emails.map((e) => [e.id, this.mockClassification(e, userTimezone)]),
      );
    }

    const emailContext =
      `Classify each of the following ${emails.length} email(s) independently. ` +
      `Recipient user timezone: ${userTimezone}.\n\n` +
      emails.map((e) => this.renderEmailBlock(e, userTimezone)).join('\n\n');

    const response = await this.generateWithRetry(emailContext);

    const responseText = response.text || '{}';
    const parsedJson = JSON.parse(responseText);

    // Validate output shape with Zod (one entry per email)
    const { results } = AiBatchOutputSchema.parse(parsedJson);
    const byId = new Map(results.map((r) => [r.email_id, r]));

    const out = new Map<string, AiClassifiedEvent | null>();
    for (const email of emails) {
      const item = byId.get(email.id);
      if (!item) {
        // The model dropped this email; treat as unclassified, not as an event.
        this.logger.warn(
          `Batch response missing result for email ${email.id}; treating as non-event`,
        );
        out.set(email.id, null);
        continue;
      }
      const { email_id: _omit, ...event } = item;
      if (!isValidDetectedEvent(event, new Date(), this.confidenceThreshold)) {
        this.logger.debug(
          `Email "${email.subject}" classified as non-actionable or below confidence (${event.confidence})`,
        );
        out.set(email.id, null);
        continue;
      }
      this.logger.log(
        `Event detected: "${event.title}" (Confidence: ${event.confidence}, Type: ${event.event_type})`,
      );
      out.set(email.id, event);
    }
    return out;
  }

  /**
   * Convenience single-email wrapper around classifyEmailBatch.
   */
  async classifyEmail(
    email: EmailDto,
    userTimezone: string = 'UTC',
  ): Promise<AiClassifiedEvent | null> {
    const results = await this.classifyEmailBatch([email], userTimezone);
    return results.get(email.id) ?? null;
  }

  private renderEmailBlock(email: EmailDto, userTimezone: string): string {
    const bodySection = email.body
      ? `
Email Body Excerpt (transient, for locating explicit dates/deadlines — never stored):
${email.body}`
      : '';

    return `=== EMAIL ${email.id} ===
Email Subject: ${email.subject}
From: ${email.from}
Date Sent: ${email.date.toISOString()}
Email Snippet/Preview:
${email.snippet}${bodySection}
`;
  }

  /**
   * Google's newer models intermittently shed load (503 "high demand") while
   * everyone migrates off retired ones; retry those in-place so one spike
   * doesn't fail the whole scan. Auth/validation errors throw immediately.
   */
  private async generateWithRetry(emailContext: string) {
    let attempt = 0;
    for (;;) {
      try {
        return await this.aiClient!.models.generateContent({
          model: this.model,
          contents: [
            {
              role: 'user',
              parts: [{ text: emailContext }],
            },
          ],
          config: {
            systemInstruction: CLASSIFICATION_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });
      } catch (err: any) {
        if (
          attempt >= this.retryDelaysMs.length ||
          !this.isTransientError(err)
        ) {
          throw err;
        }
        const delay = this.retryDelaysMs[attempt];
        attempt++;
        this.logger.warn(
          `Gemini ${this.model} transient failure (attempt ${attempt}/${this.retryDelaysMs.length + 1}): ` +
            `${String(err?.message).slice(0, 160)}. Retrying in ${delay}ms.`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private isTransientError(err: any): boolean {
    // Daily quota exhaustion (free tier: 20 req/day) resets in hours, not
    // seconds — retrying burns time and buys nothing. The scanner aborts the
    // scan on it instead.
    if (isQuotaExhaustedError(err)) return false;
    const code = err?.code ?? err?.status;
    if (typeof code === 'number') {
      return code === 429 || code >= 500;
    }
    return /"code"\s*:\s*(429|5\d\d)|high demand|UNAVAILABLE|ECONNRESET|ETIMEDOUT|socket hang up|disconnected/i.test(
      String(err?.message ?? ''),
    );
  }

  /**
   * High-accuracy heuristic fallback for local testing without API key.
   */
  private mockClassification(
    email: EmailDto,
    userTimezone: string,
  ): AiClassifiedEvent | null {
    const subject = email.subject.toLowerCase();
    const snippet = email.snippet.toLowerCase();
    const combined = `${subject} ${snippet}`;

    const isAssessment =
      combined.includes('assessment') ||
      combined.includes('coding challenge') ||
      combined.includes('test deadline');
    const isFlight =
      combined.includes('flight') ||
      combined.includes('boarding pass') ||
      combined.includes('reservation');
    const isInterview =
      combined.includes('interview') ||
      combined.includes('phone screen') ||
      combined.includes('invitation to meet');
    const isWebinar =
      combined.includes('webinar') ||
      combined.includes('workshop') ||
      combined.includes('masterclass');

    if (isAssessment || isFlight || isInterview || isWebinar) {
      // Create an event scheduled 3 days into future
      const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      futureDate.setHours(14, 0, 0, 0);

      const type = isAssessment
        ? 'assessment'
        : isFlight
          ? 'flight'
          : isInterview
            ? 'interview'
            : 'webinar';

      return {
        is_time_sensitive: true,
        event_type: type,
        title: email.subject.replace(/^(Fwd:|Re:)\s*/i, '').trim(),
        summary: email.snippet.slice(0, 150),
        start_at: futureDate.toISOString(),
        end_at: new Date(futureDate.getTime() + 3600 * 1000).toISOString(),
        deadline: isAssessment ? futureDate.toISOString() : null,
        timezone: userTimezone,
        importance: isFlight || isInterview ? 'HIGH' : 'MEDIUM',
        confidence: 0.95,
        reasoning: 'Detected actionable keywords in subject and snippet.',
      };
    }

    return null;
  }
}
