export type EventStatus =
  | "PENDING"
  | "APPROVED"
  | "ACTIVE"
  | "COMPLETED"
  | "IGNORED"
  | "EXPIRED"
  | "ERROR";

export type Importance = "LOW" | "MEDIUM" | "HIGH";

export interface DetectedEventDto {
  id: string;
  userId: string;
  gmailMessageId: string;
  emailSubject: string;
  emailSender: string;
  gmailLink: string;
  title: string;
  summary: string;
  eventType: string;
  startAt: string | null;
  endAt: string | null;
  deadline: string | null;
  timezone: string;
  importance: Importance;
  status: EventStatus;
  googleCalendarEventId: string | null;
  calendarRetryCount: number;
  autoDeleteAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiClassificationOutput {
  is_time_sensitive: boolean;
  event_type: string | null;
  title: string | null;
  summary: string | null;
  start_at: string | null;
  end_at: string | null;
  deadline: string | null;
  timezone: string | null;
  importance: "low" | "medium" | "high";
  confidence: number;
}
