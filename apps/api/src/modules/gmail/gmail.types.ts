export interface EmailDto {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: Date;
  snippet: string;
  gmailUrl: string;
}

export interface FetchEmailsOptions {
  since: Date;
  until?: Date;
  maxResults?: number;
}
