export default function CheckoutCancelledPage() {
  return (
    <main className="container" style={{ padding: '24px 0 40px' }}>
      <div className="grid-2">
        <section className="hero-card">
          <span className="kicker">Checkout cancelled</span>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)' }}>No charge was captured.</h1>
          <p>
            Cancellation returns the user to the product without changing any persisted subscription state. The current
            plan remains untouched until a confirmed payment or an explicit cancellation action occurs.
          </p>
        </section>
        <section className="card">
          <div className="layout-stack">
            <div className="notice">You can restart checkout from the dashboard.</div>
            <a className="button button-primary" href="/dashboard">Go to dashboard</a>
            <a className="button button-secondary" href="/">Open pricing</a>
          </div>
        </section>
      </div>
    </main>
  );
}
