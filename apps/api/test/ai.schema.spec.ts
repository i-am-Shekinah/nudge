import { describe, it, expect } from 'vitest';
import {
  isValidDetectedEvent,
  AiClassifiedEvent,
  AiOutputSchema,
} from '../src/modules/ai/ai.schema.js';

describe('ai.schema & validation rules', () => {
  const referenceNow = new Date('2026-10-01T12:00:00Z');

  it('should accept valid future time-sensitive event with confidence >= 0.7', () => {
    const validEvent: AiClassifiedEvent = {
      is_time_sensitive: true,
      event_type: 'interview',
      title: 'Google Final Round Interview',
      summary: 'Virtual onsite via Google Meet',
      start_at: '2026-10-15T15:00:00Z',
      end_at: '2026-10-15T16:00:00Z',
      deadline: null,
      timezone: 'America/New_York',
      importance: 'HIGH',
      confidence: 0.95,
    };

    expect(isValidDetectedEvent(validEvent, referenceNow)).toBe(true);
  });

  it('should reject non-time-sensitive items', () => {
    const nonEvent: AiClassifiedEvent = {
      is_time_sensitive: false,
      title: 'Newsletter Update',
      confidence: 0.9,
    };

    expect(isValidDetectedEvent(nonEvent, referenceNow)).toBe(false);
  });

  it('should reject events with confidence below 0.7 threshold', () => {
    const lowConfidenceEvent: AiClassifiedEvent = {
      is_time_sensitive: true,
      title: 'Possible team lunch',
      start_at: '2026-10-10T12:00:00Z',
      confidence: 0.65, // Below 0.70 threshold
      importance: 'LOW',
    };

    expect(isValidDetectedEvent(lowConfidenceEvent, referenceNow)).toBe(false);
  });

  it('should reject events with start/deadline in the past', () => {
    const pastEvent: AiClassifiedEvent = {
      is_time_sensitive: true,
      title: 'Yesterday Assessment',
      start_at: '2026-09-20T10:00:00Z', // In the past relative to referenceNow
      confidence: 0.95,
      importance: 'HIGH',
    };

    expect(isValidDetectedEvent(pastEvent, referenceNow)).toBe(false);
  });

  it('should validate and parse structured JSON correctly via Zod', () => {
    const rawAiResponse = {
      is_time_sensitive: true,
      event_type: 'assessment',
      title: 'HackerRank CodeSignal Deadline',
      summary: 'Complete within 48 hours',
      deadline: '2026-10-05T23:59:59Z',
      importance: 'HIGH',
      confidence: 0.92,
    };

    const parsed = AiOutputSchema.parse(rawAiResponse);
    expect(parsed.title).toBe('HackerRank CodeSignal Deadline');
    expect(parsed.importance).toBe('HIGH');
  });
});
