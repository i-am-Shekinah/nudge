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

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') || null;

    if (this.apiKey) {
      this.aiClient = new GoogleGenAI({ apiKey: this.apiKey });
    } else {
      this.logger.warn(
        'GEMINI_API_KEY not configured. Running in mock AI classification mode.',
      );
    }
  }

  /**
   * Classifies an email using Gemini 2.0 Flash with structured JSON output.
   * Returns valid AiClassifiedEvent or null if not actionable/time-sensitive.
   */
  async classifyEmail(
    email: EmailDto,
    userTimezone: string = 'UTC',
  ): Promise<AiClassifiedEvent | null> {
    try {
      if (!this.aiClient) {
        return this.mockClassification(email, userTimezone);
      }

      const emailContext = `
Email Subject: ${email.subject}
From: ${email.from}
Date Sent: ${email.date.toISOString()}
Recipient User Timezone: ${userTimezone}
Email Snippet/Preview:
${email.snippet}
`;

      const response = await this.aiClient.models.generateContent({
        model: 'gemini-2.0-flash',
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

      const responseText = response.text || '{}';
      const parsedJson = JSON.parse(responseText);

      // Validate output shape with Zod
      const validated = AiOutputSchema.parse(parsedJson);

      if (!isValidDetectedEvent(validated)) {
        this.logger.debug(
          `Email "${email.subject}" classified as non-actionable or below confidence (${validated.confidence})`,
        );
        return null;
      }

      this.logger.log(
        `Event detected: "${validated.title}" (Confidence: ${validated.confidence}, Type: ${validated.event_type})`,
      );

      return validated;
    } catch (err: any) {
      this.logger.error(
        `Failed to classify email ${email.id}: ${err.message}`,
        err.stack,
      );
      return null;
    }
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
