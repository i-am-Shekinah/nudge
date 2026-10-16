import { z } from 'zod';
import { Type } from '@google/genai';

export const AI_CONFIDENCE_THRESHOLD = 0.7;

export const AiOutputSchema = z.object({
  is_time_sensitive: z.boolean(),
  event_type: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  start_at: z.string().nullable().optional(),
  end_at: z.string().nullable().optional(),
  deadline: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  importance: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().nullable().optional(),
});

export type AiClassifiedEvent = z.infer<typeof AiOutputSchema>;

export const AiBatchItemSchema = AiOutputSchema.extend({
  email_id: z.string(),
});

export const AiBatchOutputSchema = z.object({
  results: z.array(AiBatchItemSchema),
});

export type AiBatchItem = z.infer<typeof AiBatchItemSchema>;

/**
 * Gemini structured-output schema: forces every model — including the
 * weaker fallback tier — to emit fields the Zod contract accepts. Prompt
 * alone was not enough: gemini-flash-lite-latest dropped is_time_sensitive
 * from all 7 results and the whole batch failed validation.
 */
export const AI_BATCH_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    results: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          email_id: { type: Type.STRING },
          is_time_sensitive: { type: Type.BOOLEAN },
          event_type: { type: Type.STRING, nullable: true },
          title: { type: Type.STRING, nullable: true },
          summary: { type: Type.STRING, nullable: true },
          start_at: { type: Type.STRING, nullable: true },
          end_at: { type: Type.STRING, nullable: true },
          deadline: { type: Type.STRING, nullable: true },
          timezone: { type: Type.STRING, nullable: true },
          importance: {
            type: Type.STRING,
            enum: ['LOW', 'MEDIUM', 'HIGH'],
          },
          confidence: { type: Type.NUMBER },
          reasoning: { type: Type.STRING, nullable: true },
        },
        required: ['email_id', 'is_time_sensitive', 'confidence', 'importance'],
      },
    },
  },
  required: ['results'],
};

/**
 * Validation rules to check if AI classification should become a DetectedEvent.
 */
export function isValidDetectedEvent(
  output: AiClassifiedEvent,
  referenceNow: Date = new Date(),
  confidenceThreshold: number = AI_CONFIDENCE_THRESHOLD,
): boolean {
  // 1. Must be flagged as time-sensitive
  if (!output.is_time_sensitive) return false;

  // 2. Must meet the confidence threshold
  if (output.confidence < confidenceThreshold) return false;

  // 3. Must have a valid title
  if (!output.title || output.title.trim().length === 0) return false;

  // 4. Must have either a start time or a deadline
  const dateStr = output.start_at || output.deadline;
  if (!dateStr) return false;

  const eventDate = new Date(dateStr);
  if (isNaN(eventDate.getTime())) return false;

  // 5. Must not be in the past
  if (eventDate.getTime() < referenceNow.getTime()) return false;

  return true;
}
