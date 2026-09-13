import { z } from 'zod';

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

/**
 * Validation rules to check if AI classification should become a DetectedEvent.
 */
export function isValidDetectedEvent(
  output: AiClassifiedEvent,
  referenceNow: Date = new Date(),
): boolean {
  // 1. Must be flagged as time-sensitive
  if (!output.is_time_sensitive) return false;

  // 2. Must meet the confidence threshold
  if (output.confidence < AI_CONFIDENCE_THRESHOLD) return false;

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
