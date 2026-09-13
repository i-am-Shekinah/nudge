export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

export type ScanStatus = "RUNNING" | "DONE" | "FAILED";

export interface ScanLogDto {
  id: string;
  userId: string;
  startedAt: string;
  completedAt: string | null;
  status: ScanStatus;
  emailsScanned: number;
  eventsDetected: number;
  windowStart: string;
  windowEnd: string;
  errorMessage: string | null;
}
