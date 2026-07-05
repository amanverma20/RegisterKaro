export const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'For solo operators validating the workflow.',
    priceMinor: 1999,
    interval: 'month',
    features: ['1 workspace', 'Email support', 'Basic invoices']
  },
  {
    id: 'growth',
    name: 'Growth',
    description: 'For small teams running billing in production.',
    priceMinor: 4999,
    interval: 'month',
    features: ['3 workspaces', 'Priority support', 'Webhook retries']
  },
  {
    id: 'scale',
    name: 'Scale',
    description: 'For teams that need approvals and auditability.',
    priceMinor: 9999,
    interval: 'month',
    features: ['Unlimited workspaces', 'Role-based access', 'Dedicated onboarding']
  }
] as const;

export type PlanId = (typeof PLANS)[number]['id'];
export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';
export type SubscriptionStatus = 'pending_activation' | 'active' | 'past_due' | 'canceled' | 'expired';
export type PaymentProvider = 'razorpay' | 'stripe' | 'mock';
export type NotificationType =
  | 'welcome'
  | 'payment_confirmed'
  | 'payment_failed'
  | 'invoice_ready'
  | 'subscription_canceled'
  | 'plan_changed';
export type PaymentPurpose = 'new_subscription' | 'plan_change' | 'renewal';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionRecord {
  id: string;
  userId: string;
  planId: PlanId;
  status: SubscriptionStatus;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  latestInvoiceId: string | null;
  latestPaymentId: string | null;
  scheduledPlanId: PlanId | null;
  scheduledPlanChangeType: 'upgrade' | 'downgrade' | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  purpose: PaymentPurpose;
  planId: PlanId;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  providerCheckoutSessionId: string | null;
  providerPaymentIntentId: string | null;
  invoiceId: string | null;
  subscriptionId: string | null;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceRecord {
  id: string;
  userId: string;
  subscriptionId: string | null;
  paymentId: string | null;
  number: string;
  amountMinor: number;
  currency: string;
  status: 'draft' | 'issued' | 'paid' | 'void';
  dueAt: string | null;
  issuedAt: string;
  paidAt: string | null;
  lineItems: Array<{ label: string; amountMinor: number }>;
  providerInvoiceId: string | null;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  type: NotificationType;
  idempotencyKey: string;
  subject: string;
  message: string;
  sentAt: string | null;
  provider: 'resend' | 'console';
  createdAt: string;
}

export interface ProcessedWebhookRecord {
  id: string;
  provider: PaymentProvider;
  eventId: string;
  type: string;
  processedAt: string;
}

export interface PublicDashboardData {
  user: Pick<UserRecord, 'id' | 'email' | 'name'>;
  subscription: SubscriptionRecord | null;
  payments: PaymentRecord[];
  invoices: InvoiceRecord[];
  notifications: NotificationRecord[];
  activePlan: ReturnType<typeof getPlanById>;
}

export function formatMoney(amountMinor: number, currency = 'inr') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0
  }).format(amountMinor / 100);
}

export function getPlanById(planId: PlanId) {
  return PLANS.find((plan) => plan.id === planId) ?? PLANS[0];
}

export function isUpgrade(fromPlanId: PlanId, toPlanId: PlanId) {
  return PLANS.findIndex((plan) => plan.id === toPlanId) > PLANS.findIndex((plan) => plan.id === fromPlanId);
}

export function getPlanChangeType(fromPlanId: PlanId, toPlanId: PlanId) {
  if (fromPlanId === toPlanId) return 'upgrade';
  return isUpgrade(fromPlanId, toPlanId) ? 'upgrade' : 'downgrade';
}

export function nowIso() {
  return new Date().toISOString();
}
