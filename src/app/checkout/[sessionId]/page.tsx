import { MockCheckoutActions } from '@/components/mock-checkout-actions';
import { RazorpayCheckoutActions } from '@/components/razorpay-checkout-actions';
import { formatMoney, getPlanById } from '@/lib/domain';
import { getStore } from '@/lib/store';

const razorpayPublicKey = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? null;

export default async function CheckoutSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const store = await getStore();
  const payment = await store.findPaymentByCheckoutSessionId(sessionId);
  const user = payment ? await store.findUserById(payment.userId) : null;
  const plan = getPlanById(payment?.planId ?? 'starter');
  const isMock = sessionId.startsWith('mock_') || payment?.provider === 'mock';
  const isRazorpay = payment?.provider === 'razorpay';

  return (
    <main className="container" style={{ padding: '24px 0 40px' }}>
      <div className="grid-2">
        <section className="hero-card">
          <span className="kicker">Checkout</span>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)' }}>Payment pending until the provider confirms it.</h1>
          <p>
            This screen intentionally separates initiation from confirmation. The subscription does not become active
            until the webhook path applies the effect exactly once.
          </p>
          <div className="pill-row" style={{ marginTop: 18 }}>
            <span className="badge">Session: {sessionId}</span>
            <span className="badge">Status: pending</span>
            {payment ? <span className="badge">Provider: {payment.provider}</span> : null}
          </div>
          {payment ? (
            <div className="grid-2" style={{ marginTop: 18 }}>
              <div className="table-card" style={{ padding: 18 }}>
                <div className="small">Plan</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{plan.name}</div>
              </div>
              <div className="table-card" style={{ padding: 18 }}>
                <div className="small">Amount</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{formatMoney(payment.amountMinor, payment.currency)}</div>
              </div>
            </div>
          ) : null}
        </section>
        <section className="card">
          {isMock ? (
            <MockCheckoutActions sessionId={sessionId} />
          ) : isRazorpay && payment ? (
            <RazorpayCheckoutActions
              publicKey={razorpayPublicKey}
              orderId={sessionId}
              paymentId={payment.id}
              amountMinor={payment.amountMinor}
              currency={payment.currency}
              planName={plan.name}
              customerName={user?.name ?? 'RegisterKaro customer'}
              customerEmail={user?.email ?? 'customer@example.com'}
            />
          ) : (
            <div className="layout-stack">
              <div className="notice">
                Real checkout sessions redirect back here only after the provider confirms the payment. Use the
                dashboard to monitor the eventual webhook outcome.
              </div>
              <a className="button button-primary" href="/dashboard">
                Back to dashboard
              </a>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
