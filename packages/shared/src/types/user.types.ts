export type ReminderPreset = "DEFAULT" | "CUSTOM";

export interface UserDto {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  notificationTime: string; // "HH:MM"
  timezone: string; // IANA timezone
  reminderPreset: ReminderPreset;
  customReminders: number[]; // minutes before event
  gmailConnected: boolean;
  createdAt: string;
}

export interface UserSettingsDto {
  notificationTime: string;
  timezone: string;
  reminderPreset: ReminderPreset;
  customReminders: number[];
}

/** Default reminder times in minutes before the event */
export const DEFAULT_REMINDERS: number[] = [4320, 1440, 60, 30, 5];
