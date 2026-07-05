import { AuthForm } from '@/components/auth-form';

export default function LoginPage() {
  return (
    <main className="container" style={{ padding: '24px 0 40px' }}>
      <div className="grid-2">
        <section className="hero-card">
          <span className="kicker">Sign in</span>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)' }}>Access the billing dashboard.</h1>
          <p>
            Log in to view current subscription state, payment history, invoices, and notification outcomes.
          </p>
        </section>
        <section className="card">
          <h2 className="section-title" style={{ fontSize: '1.5rem', marginTop: 0 }}>Welcome back</h2>
          <AuthForm mode="login" />
          <p className="form-note" style={{ marginTop: 14 }}>
            New here? <a href="/signup">Create an account</a> first.
          </p>
        </section>
      </div>
    </main>
  );
}
