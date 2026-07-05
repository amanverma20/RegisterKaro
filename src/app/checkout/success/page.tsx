import { ReplayDuplicateWebhookButton } from '@/components/replay-duplicate-webhook-button';
import { formatMoney, getPlanById } from '@/lib/domain';
import { getStore } from '@/lib/store';

function statusClass(status: string | null | undefined) {
  if (!status) return 'status-chip neutral';
  if (status === 'active' || status === 'confirmed' || status === 'paid') return 'status-chip ok';
  if (status === 'pending_activation' || status === 'pending' || status === 'past_due') return 'status-chip warn';
  if (status === 'canceled' || status === 'expired' || status === 'failed') return 'status-chip bad';
  return 'status-chip neutral';
}

export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const params = await searchParams;
  const sessionId = params.session_id ?? null;
  const store = await getStore();
  const payment = sessionId ? await store.findPaymentByCheckoutSessionId(sessionId) : null;
  const user = payment ? await store.findUserById(payment.userId) : null;
  const subscription = user ? await store.getSubscriptionByUserId(user.id) : null;
  const plan = getPlanById(payment?.planId ?? subscription?.planId ?? 'starter');
  const amountMinor = payment?.amountMinor ?? plan.priceMinor;
  const currency = payment?.currency ?? 'inr';

  return (
    <main className="container" style={{ padding: '24px 0 40px' }}>
      <div className="grid-2">
        <section className="hero-card">
          <span className="kicker">Checkout success</span>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)' }}>Payment completed, and the system has recorded the result.</h1>
          <p>
            This page summarizes the exact state after checkout. The payment is confirmed, the webhook owns the final
            subscription update, and the dashboard shows the billing history.
          </p>
          <div className="pill-row" style={{ marginTop: 18 }}>
            <span className={statusClass(payment?.status ?? null)}>Payment: {payment?.status ?? 'unknown'}</span>
            <span className={statusClass(subscription?.status ?? null)}>Subscription: {subscription?.status ?? 'unknown'}</span>
            <span className="status-chip neutral">Plan: {plan.name}</span>
          </div>
          <div className="grid-2" style={{ marginTop: 18 }}>
            <div className="table-card" style={{ padding: 18 }}>
              <div className="small">Amount</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{formatMoney(amountMinor, currency)}</div>
            </div>
            <div className="table-card" style={{ padding: 18 }}>
              <div className="small">Provider</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{payment?.provider ?? 'razorpay'}</div>
            </div>
          </div>
        </section>
        <section className="card">
          <div className="layout-stack">
            <div className="notice">Session ID: {sessionId ?? 'unknown'}</div>
            <div className="notice">Plan: {plan.name}</div>
            <div className="notice">Customer: {user?.email ?? 'unknown'}</div>
            <div className="notice">
              Webhook status: {subscription?.latestPaymentId === payment?.id ? 'applied exactly once' : 'pending or not linked yet'}
            </div>
            {payment?.provider === 'razorpay' && payment.providerPaymentIntentId ? (
              <ReplayDuplicateWebhookButton orderId={payment.providerCheckoutSessionId ?? sessionId ?? 'unknown'} paymentId={payment.providerPaymentIntentId} />
            ) : null}
            <a className="button button-primary" href="/dashboard">Open dashboard</a>
            <a className="button button-secondary" href="/">Back to pricing</a>
          </div>
        </section>
      </div>
    </main>
  );
}
