export interface EmailDto {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: Date;
  snippet: string;
  gmailUrl: string;
  /**
   * Transient body excerpt, fetched only for heuristic-passing candidates at
   * classification time. Never persisted to the database.
   */
  body?: string;
}

export interface FetchEmailsOptions {
  since: Date;
  until?: Date;
}
