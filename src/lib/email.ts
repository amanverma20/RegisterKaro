import { type NotificationRecord, nowIso } from '@/lib/domain';
import { type DataStore } from '@/lib/store';
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmailOnce(
  store: DataStore,
  notification: NotificationRecord,
  to: string,
  message: EmailMessage
) {
  if (notification.sentAt) return notification;

  if (resend && process.env.RESEND_FROM_EMAIL) {
    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL,
      to: [to],
      subject: message.subject,
      html: message.html
    });
  } else {
    console.info('[email:console]', {
      to,
      subject: message.subject,
      html: message.html
    });
  }

  await store.markNotificationSent(notification.idempotencyKey, nowIso());
  return { ...notification, sentAt: nowIso() };
}
