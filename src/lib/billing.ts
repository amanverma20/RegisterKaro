import { formatMoney, getPlanById, getPlanChangeType, nowIso, type PaymentProvider, type PaymentPurpose, type PlanId, type SubscriptionStatus } from '@/lib/domain';
import { sendEmailOnce } from '@/lib/email';
import { createCheckoutSession } from '@/lib/payments';
import {
    buildEmptySubscription,
    type DataStore
} from '@/lib/store';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

export interface CheckoutFlowResult {
  provider: PaymentProvider;
  checkoutSessionId: string;
  checkoutUrl: string;
  paymentId: string;
  publicKey: string | null;
}

export interface WebhookEventPayload {
  id: string;
  type: string;
  data: {
    object: Record<string, any>;
  };
}

function buildInvoiceLines(planId: PlanId, purpose: PaymentPurpose) {
  const plan = getPlanById(planId);
  const action = purpose === 'plan_change' ? 'Plan change charge' : 'Subscription charge';
  return [{ label: `${action} - ${plan.name}`, amountMinor: plan.priceMinor }];
}

function getSubscriptionExpiryState(subscription: Awaited<ReturnType<DataStore['getSubscriptionByUserId']>>) {
  if (!subscription) return null;

  const now = Date.now();
  const periodEnd = subscription.currentPeriodEnd ? Date.parse(subscription.currentPeriodEnd) : null;
  if (periodEnd === null || Number.isNaN(periodEnd) || periodEnd > now) {
    return subscription;
  }

  if (subscription.scheduledPlanId) {
    const newStart = subscription.currentPeriodEnd ?? nowIso();
    return {
      ...subscription,
      planId: subscription.scheduledPlanId,
      status: 'active' as const,
      cancelAtPeriodEnd: false,
      currentPeriodStart: newStart,
      currentPeriodEnd: new Date(Date.parse(newStart) + 1000 * 60 * 60 * 24 * 30).toISOString(),
      scheduledPlanId: null,
      scheduledPlanChangeType: null,
      updatedAt: nowIso()
    };
  }

  if (subscription.status === 'canceled' || subscription.cancelAtPeriodEnd || subscription.status === 'past_due') {
    return {
      ...subscription,
      status: 'expired' as const,
      updatedAt: nowIso()
    };
  }

  return {
    ...subscription,
    status: 'expired' as const,
    updatedAt: nowIso()
  };
}

function subscriptionsDiffer(
  left: NonNullable<Awaited<ReturnType<DataStore['getSubscriptionByUserId']>>>,
  right: NonNullable<Awaited<ReturnType<DataStore['getSubscriptionByUserId']>>>
) {
  return (
    left.planId !== right.planId ||
    left.status !== right.status ||
    left.cancelAtPeriodEnd !== right.cancelAtPeriodEnd ||
    left.currentPeriodStart !== right.currentPeriodStart ||
    left.currentPeriodEnd !== right.currentPeriodEnd ||
    left.scheduledPlanId !== right.scheduledPlanId ||
    left.scheduledPlanChangeType !== right.scheduledPlanChangeType ||
    left.stripeCustomerId !== right.stripeCustomerId ||
    left.stripeSubscriptionId !== right.stripeSubscriptionId ||
    left.latestInvoiceId !== right.latestInvoiceId ||
    left.latestPaymentId !== right.latestPaymentId
  );
}

async function refreshSubscriptionLifecycle(store: DataStore, userId: string) {
  const subscription = await store.getSubscriptionByUserId(userId);
  const refreshed = getSubscriptionExpiryState(subscription);
  if (subscription && refreshed && subscriptionsDiffer(subscription, refreshed)) {
    await store.saveSubscription(refreshed);
    return refreshed;
  }
  return subscription;
}

function getPlanChangeStrategy(currentPlanId: PlanId, targetPlanId: PlanId) {
  const changeType = getPlanChangeType(currentPlanId, targetPlanId);
  return {
    changeType,
    isUpgrade: changeType === 'upgrade',
    isDowngrade: changeType === 'downgrade'
  };
}

async function sendNotificationEmail(store: DataStore, user: AuthenticatedUser, type: 'welcome' | 'payment_confirmed' | 'payment_failed' | 'invoice_ready' | 'subscription_canceled' | 'plan_changed', subject: string, message: string, idempotencyKey: string) {
  const provider = process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL ? 'resend' : 'console';
  const notification = await store.createNotification({
    userId: user.id,
    type,
    idempotencyKey,
    subject,
    message,
    provider
  });

  if (!notification) return null;

  return sendEmailOnce(store, notification, user.email, {
    to: user.email,
    subject,
    html: `<div style="font-family:Inter,system-ui,sans-serif;color:#0f172a;line-height:1.6"><h2>${subject}</h2><p>${message}</p></div>`
  });
}

async function sendPaymentFailureNotification(store: DataStore, user: AuthenticatedUser, paymentId: string, planName: string, amountMinor: number, currency: string) {
  await sendNotificationEmail(
    store,
    user,
    'payment_failed',
    `Payment failed for ${planName}`,
    `We could not confirm the ${planName} charge of ${formatMoney(amountMinor, currency)}. Your subscription remains pending or past due until payment succeeds.`,
    `payment-failed:${paymentId}`
  );
}

export async function startCheckout(store: DataStore, user: AuthenticatedUser, planId: PlanId, purpose: PaymentPurpose) {
  const plan = getPlanById(planId);
  const session = await createCheckoutSession({
    userId: user.id,
    userEmail: user.email,
    planId,
    paymentPurpose: purpose,
    description: `Subscribe to ${plan.name} (${purpose})`
  });

  const payment = await store.createPayment({
    userId: user.id,
    purpose,
    planId,
    amountMinor: plan.priceMinor,
    currency: 'inr',
    provider: session.provider,
    description: `Checkout for ${plan.name}`,
    providerCheckoutSessionId: session.checkoutSessionId,
    providerPaymentIntentId: session.paymentIntentId
  });

  if (purpose === 'plan_change') {
    const currentSubscription = await refreshSubscriptionLifecycle(store, user.id);
    if (currentSubscription) {
      const strategy = getPlanChangeStrategy(currentSubscription.planId, planId);
      const updatedSubscription = {
        ...currentSubscription,
        scheduledPlanId: strategy.isDowngrade ? planId : null,
        scheduledPlanChangeType: strategy.isDowngrade ? ('downgrade' as const) : null,
        updatedAt: nowIso()
      } satisfies Awaited<ReturnType<DataStore['getSubscriptionByUserId']>>;
      await store.saveSubscription(updatedSubscription);
    }
  }

  return {
    ...session,
    paymentId: payment.id
  } satisfies CheckoutFlowResult;
}

async function finalizePaymentConfirmation(
  store: DataStore,
  user: AuthenticatedUser,
  paymentId: string,
  planId: PlanId,
  purpose: PaymentPurpose,
  eventId: string,
  providerIntentId: string | null,
  providerInvoiceId: string | null,
  currentSubscriptionId: string | null,
  stripeSubscriptionId: string | null
) {
  const payment = await store.findPaymentById(paymentId);
  if (!payment) return { applied: false, reason: 'payment_missing' as const };
  if (payment.status === 'confirmed') return { applied: false, reason: 'already_confirmed' as const };

  const refreshedSubscription = await refreshSubscriptionLifecycle(store, user.id);

  const invoice = await store.createInvoice({
    userId: user.id,
    subscriptionId: currentSubscriptionId ?? refreshedSubscription?.id ?? null,
    paymentId: payment.id,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    lineItems: buildInvoiceLines(planId, purpose),
    providerInvoiceId
  });

  const nextSubscriptionBase = refreshedSubscription ?? buildEmptySubscription(user.id, planId);
  const plan = getPlanById(planId);
  const planChangeStrategy = purpose === 'plan_change' ? getPlanChangeStrategy(nextSubscriptionBase.planId, planId) : null;
  const shouldApplyImmediately = !planChangeStrategy || planChangeStrategy.isUpgrade || purpose !== 'plan_change';
  const subscription = {
    ...nextSubscriptionBase,
    planId: shouldApplyImmediately ? planId : nextSubscriptionBase.planId,
    status: 'active' as const,
    cancelAtPeriodEnd: false,
    currentPeriodStart: nextSubscriptionBase.currentPeriodStart ?? nowIso(),
    currentPeriodEnd: nextSubscriptionBase.currentPeriodEnd ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    stripeSubscriptionId: stripeSubscriptionId ?? nextSubscriptionBase.stripeSubscriptionId,
    latestInvoiceId: invoice.id,
    latestPaymentId: payment.id,
    scheduledPlanId: shouldApplyImmediately ? null : planId,
    scheduledPlanChangeType: shouldApplyImmediately ? null : ('downgrade' as const),
    updatedAt: nowIso()
  } satisfies Awaited<ReturnType<DataStore['getSubscriptionByUserId']>>;

  await store.saveSubscription(subscription);
  await store.updatePayment(payment.id, {
    status: 'confirmed',
    providerPaymentIntentId: providerIntentId ?? payment.providerPaymentIntentId,
    providerCheckoutSessionId: payment.providerCheckoutSessionId,
    invoiceId: invoice.id,
    subscriptionId: subscription.id,
    updatedAt: nowIso()
  });
  await store.updateInvoice(invoice.id, { status: 'paid', paidAt: nowIso() });

  await sendNotificationEmail(
    store,
    user,
    'payment_confirmed',
    `Payment confirmed for ${plan.name}`,
    `We confirmed your ${plan.name} payment of ${formatMoney(payment.amountMinor, payment.currency)}.`,
    `payment-confirmed:${eventId}:${payment.id}`
  );

  await sendNotificationEmail(
    store,
    user,
    'invoice_ready',
    `Invoice ${invoice.number} issued`,
    `Your invoice for ${plan.name} is ready for ${formatMoney(invoice.amountMinor, invoice.currency)}.`,
    `invoice-issued:${invoice.id}`
  );

  if (purpose === 'new_subscription') {
    await sendNotificationEmail(
      store,
      user,
      'welcome',
      `Welcome to ${plan.name}`,
      `Your subscription is active until ${new Date(subscription.currentPeriodEnd).toLocaleDateString('en-IN')}.`,
      `welcome:${subscription.id}`
    );
  }

  if (purpose === 'plan_change') {
    await sendNotificationEmail(
      store,
      user,
      'plan_changed',
      `Plan change requested for ${plan.name}`,
      shouldApplyImmediately
        ? `Your upgrade to ${plan.name} is now active. The system applied the new plan exactly once.`
        : `Your downgrade to ${plan.name} will take effect at the end of the current billing period.`,
      `plan-change:${payment.id}`
    );
  }

  return { applied: true as const, invoice, payment, subscription };
}

export async function handleWebhookEvent(store: DataStore, event: WebhookEventPayload, provider: PaymentProvider) {
  const accepted = await store.recordWebhookEvent(provider, event.id, event.type);
  if (!accepted) {
    return { duplicate: true, handled: false };
  }

  const object = event.data.object;
  const metadata = (object.metadata ?? {}) as Record<string, string>;
  const planId = (metadata.planId ?? object.planId ?? 'starter') as PlanId;
  const purpose = (metadata.purpose ?? object.purpose ?? 'new_subscription') as PaymentPurpose;
  const userId = metadata.userId ?? object.userId ?? null;

  const isPaymentConfirmationEvent =
    event.type === 'checkout.session.completed' ||
    event.type === 'invoice.paid' ||
    event.type === 'payment.captured' ||
    event.type === 'payment.authorized' ||
    event.type === 'order.paid';

  const isPaymentFailureEvent =
    event.type === 'payment.failed' ||
    event.type === 'invoice.payment_failed' ||
    event.type === 'checkout.session.expired';

  if (isPaymentConfirmationEvent) {
    const sessionId = (object.id as string | undefined) ?? (object.checkout_session_id as string | undefined) ?? null;
    const paymentIntentId = (object.payment_intent as string | undefined) ?? (object.paymentIntentId as string | undefined) ?? null;
    const payment =
      (sessionId ? await store.findPaymentByCheckoutSessionId(sessionId) : null) ??
      (paymentIntentId ? await store.findPaymentByProviderIntentId(paymentIntentId) : null);

    if (!payment) {
      return { duplicate: false, handled: false, reason: 'payment_missing' as const };
    }

    const resolvedUserId = userId ?? payment.userId;
    const user = resolvedUserId ? await store.findUserById(resolvedUserId) : null;
    if (!user) {
      return { duplicate: false, handled: false, reason: 'user_missing' as const };
    }

    const effectivePlanId = payment.planId;
    const effectivePurpose = payment.purpose;
    const stripeSubscriptionId = (object.subscription as string | undefined) ?? payment.subscriptionId;

    const result = await finalizePaymentConfirmation(
      store,
      { id: user.id, email: user.email, name: user.name },
      payment.id,
      effectivePlanId,
      effectivePurpose,
      event.id,
      paymentIntentId,
      (object.invoice as string | undefined) ?? null,
      payment.subscriptionId,
      stripeSubscriptionId ?? null
    );

    return { duplicate: false, handled: true, result };
  }

  if (isPaymentFailureEvent) {
    const sessionId = (object.id as string | undefined) ?? (object.checkout_session_id as string | undefined) ?? null;
    const paymentIntentId = (object.payment_intent as string | undefined) ?? (object.paymentIntentId as string | undefined) ?? null;
    const payment =
      (sessionId ? await store.findPaymentByCheckoutSessionId(sessionId) : null) ??
      (paymentIntentId ? await store.findPaymentByProviderIntentId(paymentIntentId) : null);

    if (!payment) {
      return { duplicate: false, handled: false, reason: 'payment_missing' as const };
    }

    const user = await store.findUserById(payment.userId);
    if (!user) {
      return { duplicate: false, handled: false, reason: 'user_missing' as const };
    }

    const subscription = await refreshSubscriptionLifecycle(store, user.id);
    const updatedSubscription = subscription
      ? {
          ...subscription,
          status: (subscription.status === 'active' ? 'past_due' : 'pending_activation') as SubscriptionStatus,
          updatedAt: nowIso()
        }
      : null;

    if (updatedSubscription) {
      await store.saveSubscription(updatedSubscription);
    }

    await store.updatePayment(payment.id, {
      status: 'failed',
      updatedAt: nowIso()
    });

    await sendPaymentFailureNotification(store, { id: user.id, email: user.email, name: user.name }, payment.id, getPlanById(payment.planId).name, payment.amountMinor, payment.currency);

    return { duplicate: false, handled: true, result: { paymentId: payment.id, status: 'failed' as const } };
  }

  if (event.type === 'customer.subscription.updated') {
    const stripeSubscriptionId = (object.id as string | undefined) ?? null;
    const subscription =
      (userId ? await store.getSubscriptionByUserId(userId) : null) ??
      (stripeSubscriptionId ? await store.findSubscriptionByStripeSubscriptionId(stripeSubscriptionId) : null);
    if (!subscription) return { duplicate: false, handled: false, reason: 'subscription_missing' as const };
    const nextStatus = (object.status as string | undefined) ?? 'active';
    const updatedSubscription = {
      ...subscription,
      status: nextStatus === 'active' ? 'active' : nextStatus === 'past_due' ? 'past_due' : subscription.status,
      cancelAtPeriodEnd: Boolean(object.cancel_at_period_end ?? object.cancelAtPeriodEnd ?? false),
      currentPeriodStart: object.current_period_start ? new Date(object.current_period_start * 1000).toISOString() : subscription.currentPeriodStart,
      currentPeriodEnd: object.current_period_end ? new Date(object.current_period_end * 1000).toISOString() : subscription.currentPeriodEnd,
      stripeCustomerId: (object.customer as string | undefined) ?? subscription.stripeCustomerId,
      stripeSubscriptionId: stripeSubscriptionId ?? subscription.stripeSubscriptionId,
      updatedAt: nowIso()
    } satisfies typeof subscription;
    await store.saveSubscription(updatedSubscription);
    return { duplicate: false, handled: true, result: updatedSubscription };
  }

  if (event.type === 'customer.subscription.deleted') {
    const stripeSubscriptionId = (object.id as string | undefined) ?? null;
    const subscription =
      (userId ? await store.getSubscriptionByUserId(userId) : null) ??
      (stripeSubscriptionId ? await store.findSubscriptionByStripeSubscriptionId(stripeSubscriptionId) : null);
    if (!subscription) return { duplicate: false, handled: false, reason: 'subscription_missing' as const };
    const canceled = {
      ...subscription,
      status: 'canceled' as const,
      cancelAtPeriodEnd: true,
      updatedAt: nowIso()
    };
    await store.saveSubscription(canceled);
    const user = userId ? await store.findUserById(userId) : null;
    if (user) {
      await sendNotificationEmail(
        store,
        user,
        'subscription_canceled',
        `Subscription canceled`,
        `Your subscription is now canceled and will not renew again.`,
        `subscription-canceled:${subscription.id}`
      );
    }
    return { duplicate: false, handled: true, result: canceled };
  }

  return { duplicate: false, handled: false, reason: 'ignored_event' as const };
}

export async function createSubscriptionCheckout(store: DataStore, user: AuthenticatedUser, planId: PlanId) {
  const purpose: PaymentPurpose = 'new_subscription';
  return startCheckout(store, user, planId, purpose);
}

export async function createPlanChangeCheckout(store: DataStore, user: AuthenticatedUser, planId: PlanId) {
  const purpose: PaymentPurpose = 'plan_change';
  return startCheckout(store, user, planId, purpose);
}

export async function cancelSubscription(store: DataStore, user: AuthenticatedUser) {
  const subscription = await refreshSubscriptionLifecycle(store, user.id);
  if (!subscription) return null;
  const canceled = {
    ...subscription,
    status: 'canceled' as const,
    cancelAtPeriodEnd: true,
    updatedAt: nowIso()
  };
  await store.saveSubscription(canceled);
  await sendNotificationEmail(
    store,
    user,
    'subscription_canceled',
    'Subscription cancellation confirmed',
    'Your subscription will remain active until the end of the current billing period.',
    `cancel:${subscription.id}`
  );
  return canceled;
}

export async function getDashboardData(store: DataStore, user: AuthenticatedUser) {
  const subscription = await refreshSubscriptionLifecycle(store, user.id);
  const payments = await store.listPaymentsByUserId(user.id);
  const invoices = await store.listInvoicesByUserId(user.id);
  const notifications = await store.listNotificationsByUserId(user.id);
  return {
    user,
    subscription,
    payments,
    invoices,
    notifications,
    activePlan: getPlanById(subscription?.planId ?? 'starter')
  };
}
