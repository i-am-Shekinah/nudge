import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { getNextMidnight, getNextScheduledTime } from '../../common/timezone.util.js';
import { ReminderPreset } from '@prisma/client';

export const DEFAULT_REMINDER_MINUTES = [4320, 1440, 60, 30, 5]; // 3d, 1d, 1h, 30m, 5m

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getSettings(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        timezone: true,
        notificationTime: true,
        reminderPreset: true,
        customReminders: true,
        pushSubscription: true,
        gmailConnected: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    return {
      ...user,
      hasPushSubscription: !!user.pushSubscription,
    };
  }

  async updateSettings(
    userId: string,
    data: { timezone?: string; notificationTime?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);

    const newTimezone = data.timezone || user.timezone;
    const newNotificationTime = data.notificationTime || user.notificationTime;

    // Recalculate next scheduled pointers immediately
    const now = new Date();
    const nextScanAt = getNextMidnight(newTimezone, now);
    const nextNotifyAt = getNextScheduledTime(newNotificationTime, newTimezone, now);

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        timezone: newTimezone,
        notificationTime: newNotificationTime,
        nextScanAt,
        nextNotifyAt,
      },
      select: {
        id: true,
        timezone: true,
        notificationTime: true,
        nextScanAt: true,
        nextNotifyAt: true,
      },
    });
  }

  async getReminders(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { reminderPreset: true, customReminders: true },
    });

    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return user;
  }

  async updateReminders(userId: string, reminders: number[]) {
    const sorted = [...reminders].sort((a, b) => b - a); // descending
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        reminderPreset: ReminderPreset.CUSTOM,
        customReminders: sorted,
      },
      select: {
        reminderPreset: true,
        customReminders: true,
      },
    });
  }

  async resetReminders(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        reminderPreset: ReminderPreset.DEFAULT,
        customReminders: DEFAULT_REMINDER_MINUTES,
      },
      select: {
        reminderPreset: true,
        customReminders: true,
      },
    });
  }

  async savePushSubscription(userId: string, subscription: any) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        pushSubscription: subscription,
      },
    });
  }

  getVapidPublicKey() {
    return (
      this.configService.get<string>('VAPID_PUBLIC_KEY') ||
      'mock-vapid-public-key-for-development'
    );
  }
}
