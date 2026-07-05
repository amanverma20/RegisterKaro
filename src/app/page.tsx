import { PLANS, formatMoney } from '@/lib/domain';

export default function HomePage() {
  return (
    <main className="container">
      <section className="hero">
        <div className="hero-card">
          <span className="kicker">Subscription billing platform · states first</span>
          <h1>Build the billing flow that survives real payment edge cases.</h1>
          <p>
            RegisterKaro is a full-stack subscription product for discovering a plan, checking out, confirming payment
            through webhooks, generating invoices, and sending exactly-once notifications.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="/signup">Create account</a>
            <a className="button button-secondary" href="/dashboard">Open dashboard</a>
          </div>
          <div className="pill-row" style={{ marginTop: 18 }}>
            <span className="badge">JWT auth</span>
            <span className="badge">Webhook idempotency</span>
            <span className="badge">Minor-unit pricing</span>
            <span className="badge">Stripe or local demo mode</span>
          </div>
        </div>
      </section>

      <section className="layout-stack" style={{ paddingBottom: 24 }}>
        <div>
          <h2 className="section-title">Plans</h2>
          <p className="section-subtitle">Each plan uses the same flow. The difference is how the system behaves when state changes.</p>
        </div>
        <div className="grid-3">
          {PLANS.map((plan) => (
            <article className="card plan-card" key={plan.id}>
              <div className="pill-row">
                <span className="status-chip ok">{plan.name}</span>
                <span className="status-chip neutral">{plan.interval}</span>
              </div>
              <div className="plan-price">{formatMoney(plan.priceMinor)}</div>
              <p className="muted">{plan.description}</p>
              <ul className="plan-list">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="split-view" style={{ paddingBottom: 32 }}>
        <div className="table-card">
          <h3 className="section-title" style={{ fontSize: '1.35rem' }}>Flow decisions</h3>
          <div className="stack-compact">
            <div className="notice">Checkout creates a pending payment first. The subscription becomes active only after a webhook confirms the charge.</div>
            <div className="notice">Webhook processing is idempotent. Replayed events are recorded once and ignored on repeat delivery.</div>
            <div className="notice">Cancellation is effective at period end, so users keep access until the current cycle completes.</div>
          </div>
        </div>
        <div className="table-card">
          <h3 className="section-title" style={{ fontSize: '1.35rem' }}>What is shipped</h3>
          <div className="stack-compact">
            <a className="link-card" href="/signup">
              <strong>1. Sign up</strong>
              <div className="muted">Create a JWT-backed account with email and password.</div>
            </a>
            <a className="link-card" href="/dashboard">
              <strong>2. Subscribe</strong>
              <div className="muted">Pick a plan, create checkout, and watch the state change.</div>
            </a>
            <a className="link-card" href="/checkout/mock">
              <strong>3. Demo webhook replay</strong>
              <div className="muted">Use the local mock flow to confirm and replay the same webhook.</div>
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
