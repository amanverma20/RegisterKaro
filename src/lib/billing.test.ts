import { describe, expect, it } from 'vitest';
import { hashPassword } from './auth';
import { getDashboardData, handleWebhookEvent } from './billing';
import { createTestStore } from './store';

function buildCheckoutEvent(eventId: string, sessionId: string) {
  return {
    id: eventId,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: sessionId,
        checkout_session_id: sessionId,
        payment_intent: `${sessionId}_pi`,
        invoice: `${sessionId}_inv`,
        metadata: {}
      }
    }
  };
}

describe('handleWebhookEvent', () => {
  it('applies a checkout confirmation exactly once when the webhook is replayed', async () => {
    const store = createTestStore();
    const user = await store.createUser({
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: await hashPassword('password123')
    });

    await store.createPayment({
      userId: user.id,
      purpose: 'new_subscription',
      planId: 'starter',
      amountMinor: 1999,
      currency: 'inr',
      provider: 'mock',
      description: 'Starter checkout',
      providerCheckoutSessionId: 'mock_session_1',
      providerPaymentIntentId: null
    });

    const firstResult = await handleWebhookEvent(store, buildCheckoutEvent('evt_1', 'mock_session_1'), 'mock');
    const secondResult = await handleWebhookEvent(store, buildCheckoutEvent('evt_1', 'mock_session_1'), 'mock');

    const payments = await store.listPaymentsByUserId(user.id);
    const invoices = await store.listInvoicesByUserId(user.id);
    const notifications = await store.listNotificationsByUserId(user.id);
    const subscription = await store.getSubscriptionByUserId(user.id);

    expect(firstResult.handled).toBe(true);
    expect(secondResult.duplicate).toBe(true);
    expect(payments[0]?.status).toBe('confirmed');
    expect(invoices).toHaveLength(1);
    expect(notifications).toHaveLength(3);
    expect(subscription?.status).toBe('active');
  });

  it('marks failed payments and the subscription as past due', async () => {
    const store = createTestStore();
    const user = await store.createUser({
      email: 'fail@example.com',
      name: 'Failure User',
      passwordHash: await hashPassword('password123')
    });

    await store.saveSubscription({
      id: 'sub_1',
      userId: user.id,
      planId: 'growth',
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodStart: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      latestInvoiceId: null,
      latestPaymentId: null,
      scheduledPlanId: null,
      scheduledPlanChangeType: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    await store.createPayment({
      userId: user.id,
      purpose: 'new_subscription',
      planId: 'growth',
      amountMinor: 4999,
      currency: 'inr',
      provider: 'razorpay',
      description: 'Growth checkout',
      providerCheckoutSessionId: 'order_fail_1',
      providerPaymentIntentId: null
    });

    const result = await handleWebhookEvent(
      store,
      {
        id: 'fail_evt_1',
        type: 'payment.failed',
        data: {
          object: {
            id: 'order_fail_1',
            payment_intent: 'pay_fail_1',
            status: 'failed',
            metadata: {}
          }
        }
      },
      'razorpay'
    );

    const payments = await store.listPaymentsByUserId(user.id);
    const subscription = await store.getSubscriptionByUserId(user.id);
    const notifications = await store.listNotificationsByUserId(user.id);

    expect(result.handled).toBe(true);
    expect(payments[0]?.status).toBe('failed');
    expect(subscription?.status).toBe('past_due');
    expect(notifications[0]?.type).toBe('payment_failed');
  });

  it('expires a subscription and applies the next scheduled plan on dashboard refresh', async () => {
    const store = createTestStore();
    const user = await store.createUser({
      email: 'downgrade@example.com',
      name: 'Downgrade User',
      passwordHash: await hashPassword('password123')
    });

    const expiredPeriodEnd = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString();
    await store.saveSubscription({
      id: 'sub_2',
      userId: user.id,
      planId: 'growth',
      status: 'active',
      cancelAtPeriodEnd: false,
      currentPeriodStart: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
      currentPeriodEnd: expiredPeriodEnd,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      latestInvoiceId: null,
      latestPaymentId: null,
      scheduledPlanId: 'starter',
      scheduledPlanChangeType: 'downgrade',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const dashboard = await getDashboardData(store, { id: user.id, email: user.email, name: user.name });

    expect(dashboard.subscription?.planId).toBe('starter');
    expect(dashboard.subscription?.status).toBe('active');
    expect(dashboard.subscription?.scheduledPlanId).toBeNull();
  });
});
