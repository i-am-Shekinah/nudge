import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { CLASSIFICATION_SYSTEM_PROMPT } from './ai.prompt.js';
import {
  AiOutputSchema,
  AiClassifiedEvent,
  isValidDetectedEvent,
} from './ai.schema.js';
import { EmailDto } from '../gmail/gmail.types.js';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiClient: GoogleGenAI | null = null;
  private readonly apiKey: string | null;
  private readonly model: string;
  private readonly confidenceThreshold: number;
  // 3 attempts total: immediate, +2s, +8s — rides out a 503 load-shed burst
  private readonly retryDelaysMs = [2_000, 8_000];

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

    if (this.apiKey) {
      this.aiClient = new GoogleGenAI({ apiKey: this.apiKey });
    } else {
      this.logger.warn(
        'GEMINI_API_KEY not configured. Running in mock AI classification mode.',
      );
    }
  }

  /**
   * Classifies an email using Gemini with structured JSON output.
   * Returns a valid AiClassifiedEvent, or null if the email is not actionable.
   * API/parse errors are NOT swallowed: the scanner needs to tell "no event"
   * apart from "AI unreachable" so a systematic outage fails the scan and
   * holds the cursor instead of silently burning the window.
   */
  async classifyEmail(
    email: EmailDto,
    userTimezone: string = 'UTC',
  ): Promise<AiClassifiedEvent | null> {
    if (!this.aiClient) {
      return this.mockClassification(email, userTimezone);
    }

    const bodySection = email.body
      ? `
Email Body Excerpt (transient, for locating explicit dates/deadlines — never stored):
${email.body}
`
      : '';

    const emailContext = `
Email Subject: ${email.subject}
From: ${email.from}
Date Sent: ${email.date.toISOString()}
Recipient User Timezone: ${userTimezone}
Email Snippet/Preview:
${email.snippet}${bodySection}
`;

    const response = await this.generateWithRetry(emailContext);

    const responseText = response.text || '{}';
    const parsedJson = JSON.parse(responseText);

    // Validate output shape with Zod
    const validated = AiOutputSchema.parse(parsedJson);

    if (!isValidDetectedEvent(validated, new Date(), this.confidenceThreshold)) {
      this.logger.debug(
        `Email "${email.subject}" classified as non-actionable or below confidence (${validated.confidence})`,
      );
      return null;
    }

    this.logger.log(
      `Event detected: "${validated.title}" (Confidence: ${validated.confidence}, Type: ${validated.event_type})`,
    );

    return validated;
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
