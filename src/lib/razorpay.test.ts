import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from './auth';
import { handleWebhookEvent } from './billing';
import { buildRazorpayWebhookEvent, verifyRazorpayCheckoutSignature } from './razorpay';
import { createTestStore } from './store';

describe('razorpay helpers', () => {
  const originalSecret = process.env.RAZORPAY_KEY_SECRET;

  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = 'test_secret';
  });

  afterEach(() => {
    process.env.RAZORPAY_KEY_SECRET = originalSecret;
  });

  it('verifies checkout signatures', () => {
    const orderId = 'order_123';
    const paymentId = 'pay_123';
    const signature = require('node:crypto')
      .createHmac('sha256', 'test_secret')
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    expect(
      verifyRazorpayCheckoutSignature({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature
      })
    ).toBe(true);
  });

  it('applies a Razorpay payment event only once', async () => {
    const store = createTestStore();
    const user = await store.createUser({
      email: 'razorpay@example.com',
      name: 'Razorpay User',
      passwordHash: await hashPassword('password123')
    });

    await store.createPayment({
      userId: user.id,
      purpose: 'new_subscription',
      planId: 'starter',
      amountMinor: 1999,
      currency: 'inr',
      provider: 'razorpay',
      description: 'Starter checkout',
      providerCheckoutSessionId: 'order_razor_1',
      providerPaymentIntentId: null
    });

    const event = buildRazorpayWebhookEvent({
      razorpay_order_id: 'order_razor_1',
      razorpay_payment_id: 'pay_razor_1',
      razorpay_signature: 'signature'
    });

    const first = await handleWebhookEvent(store, event, 'razorpay');
    const second = await handleWebhookEvent(store, event, 'razorpay');

    const invoices = await store.listInvoicesByUserId(user.id);
    const notifications = await store.listNotificationsByUserId(user.id);

    expect(first.handled).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(invoices).toHaveLength(1);
    expect(notifications).toHaveLength(3);
  });
});