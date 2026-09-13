import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DetectedEvent, User } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly resend: Resend | null = null;
  private readonly isPushConfigured: boolean = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const resendKey = this.configService.get<string>('RESEND_API_KEY');
    if (resendKey && resendKey !== 'mock-resend-key') {
      this.resend = new Resend(resendKey);
    } else {
      this.logger.warn('RESEND_API_KEY not set. Operating in mock email notification mode.');
    }

    const vapidPublic = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const vapidPrivate = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const vapidSubject =
      this.configService.get<string>('VAPID_SUBJECT') || 'mailto:support@nudge.app';

    if (vapidPublic && vapidPrivate) {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
      this.isPushConfigured = true;
    } else {
      this.logger.warn('VAPID keys not set. Operating in mock web push mode.');
    }
  }

  /**
   * Dispatches the daily morning digest email and push notification.
   */
  async sendMorningSummary(user: User, pendingEvents: DetectedEvent[]) {
    if (pendingEvents.length === 0) {
      return; // Do not notify if there are no pending events
    }

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';
    const count = pendingEvents.length;
    const subject = `Nudge: ${count} event${count > 1 ? 's' : ''} awaiting your review`;

    const eventsHtml = pendingEvents
      .map((e) => {
        const dateStr = e.startAt || e.deadline ? new Date(e.startAt || e.deadline!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Flexible';
        return `
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 12px;">
          <h4 style="margin: 0 0 6px 0; color: #0f172a; font-size: 16px;">${e.title}</h4>
          <p style="margin: 0 0 8px 0; color: #475569; font-size: 13px;">📅 ${dateStr} • From: ${e.emailSender}</p>
          <p style="margin: 0; color: #64748b; font-size: 13px;">${e.summary}</p>
        </div>`;
      })
      .join('');

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 580px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
        <div style="text-align: center; padding: 24px 0;">
          <h2 style="margin: 0; color: #4338ca; font-size: 24px;">⚡ Nudge Morning Digest</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 6px;">Your daily inbox-to-calendar briefing</p>
        </div>
        <p>Good morning <strong>${user.name}</strong>,</p>
        <p>We found <strong>${count} actionable event${count > 1 ? 's' : ''}</strong> buried in your recent emails awaiting your approval:</p>
        
        <div style="margin: 20px 0;">
          ${eventsHtml}
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${frontendUrl}/dashboard" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
            Review on Dashboard →
          </a>
        </div>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">
          Note: Actionable events are stored for 7 days after the event date, after which they are automatically purged.
        </p>
      </div>
    `;

    // 1. Send Email
    if (this.resend) {
      try {
        await this.resend.emails.send({
          from: 'Nudge <digest@nudge.app>',
          to: user.email,
          subject,
          html: htmlBody,
        });
        this.logger.log(`Morning digest email sent to ${user.email}`);
      } catch (err: any) {
        this.logger.error(`Resend email error: ${err.message}`);
      }
    } else {
      this.logger.log(`[MOCK EMAIL] Morning digest to ${user.email} (${count} events)`);
    }

    // 2. Send Web Push Notification
    if (user.pushSubscription) {
      await this.sendPush(user.pushSubscription, {
        title: `Nudge: ${count} New Event${count > 1 ? 's' : ''}`,
        body: `You have ${count} pending event${count > 1 ? 's' : ''} to review.`,
        url: `${frontendUrl}/dashboard`,
      });
    }
  }

  /**
   * Alerts user if Google Calendar event creation repeatedly fails.
   */
  async notifyCalendarError(userId: string, event: DetectedEvent) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    this.logger.warn(`Calendar sync failed after 3 attempts for event ${event.id}. Alerting ${user.email}.`);

    if (this.resend) {
      try {
        await this.resend.emails.send({
          from: 'Nudge Alerts <alerts@nudge.app>',
          to: user.email,
          subject: `Alert: Could not sync "${event.title}" to Google Calendar`,
          html: `<p>Hi ${user.name},</p><p>We encountered an error syncing <strong>${event.title}</strong> to your Google Calendar. Please visit your dashboard to retry or re-authenticate Google Calendar.</p>`,
        });
      } catch (err: any) {
        this.logger.error(`Failed to send calendar error email: ${err.message}`);
      }
    }
  }

  /**
   * Helper to send Web Push payload.
   */
  private async sendPush(subscription: any, payload: { title: string; body: string; url: string }) {
    if (!this.isPushConfigured) {
      this.logger.log(`[MOCK PUSH] ${payload.title}: ${payload.body}`);
      return;
    }

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      this.logger.log(`Web push sent: ${payload.title}`);
    } catch (err: any) {
      this.logger.warn(`Web push delivery failed: ${err.message}`);
    }
  }
}
