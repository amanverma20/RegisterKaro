import type { WebhookEventPayload } from '@/lib/billing';
import crypto from 'node:crypto';

export interface RazorpayCheckoutCallback {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayWebhookBody {
  event?: string;
  id?: string;
  created_at?: number;
  payload?: {
    payment?: { entity?: Record<string, any> };
    order?: { entity?: Record<string, any> };
  };
}

function getRazorpaySecret() {
  return process.env.RAZORPAY_KEY_SECRET ?? null;
}

function getRazorpayWebhookSecret() {
  return process.env.RAZORPAY_WEBHOOK_SECRET ?? null;
}

function timingSafeEqualHex(expected: string, actual: string) {
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function verifyRazorpayCheckoutSignature(payload: RazorpayCheckoutCallback) {
  const secret = getRazorpaySecret();
  if (!secret) {
    throw new Error('Razorpay key secret is not configured');
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${payload.razorpay_order_id}|${payload.razorpay_payment_id}`)
    .digest('hex');

  return timingSafeEqualHex(expected, payload.razorpay_signature);
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string) {
  const secret = getRazorpayWebhookSecret();
  if (!secret) {
    throw new Error('Razorpay webhook secret is not configured');
  }

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return timingSafeEqualHex(expected, signature);
}

export function buildRazorpayWebhookEvent(body: RazorpayWebhookBody | RazorpayCheckoutCallback): WebhookEventPayload {
  if ('razorpay_payment_id' in body) {
    return {
      id: `razorpay:${body.razorpay_payment_id}`,
      type: 'payment.captured',
      data: {
        object: {
          id: body.razorpay_order_id,
          order_id: body.razorpay_order_id,
          payment_intent: body.razorpay_payment_id,
          payment_id: body.razorpay_payment_id,
          status: 'captured',
          metadata: {}
        }
      }
    };
  }

  const paymentEntity = body.payload?.payment?.entity;
  const orderEntity = body.payload?.order?.entity;
  const entity = paymentEntity ?? orderEntity ?? {};
  const eventType = body.event ?? 'payment.captured';
  const resolvedId = String(entity.id ?? orderEntity?.id ?? paymentEntity?.id ?? `razorpay_${crypto.randomUUID()}`);

  return {
    id: body.id ?? `razorpay:${resolvedId}`,
    type: eventType,
    data: {
      object: {
        id: String(entity.order_id ?? orderEntity?.id ?? resolvedId),
        order_id: String(entity.order_id ?? orderEntity?.id ?? resolvedId),
        payment_intent: String(entity.id ?? paymentEntity?.id ?? resolvedId),
        payment_id: String(entity.id ?? paymentEntity?.id ?? resolvedId),
        status: String(entity.status ?? 'captured'),
        metadata: entity.notes ?? orderEntity?.notes ?? paymentEntity?.notes ?? {}
      }
    }
  };
}
