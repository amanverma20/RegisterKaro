import { AuthForm } from '@/components/auth-form';

export default function SignupPage() {
  return (
    <main className="container" style={{ padding: '24px 0 40px' }}>
      <div className="grid-2">
        <section className="hero-card">
          <span className="kicker">Create account</span>
          <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)' }}>Set up the account that owns the subscription.</h1>
          <p>
            The user identity is intentionally simple: email, password, and JWT cookies. That keeps the billing flows
            clear and avoids hiding the core decisions behind auth complexity.
          </p>
        </section>
        <section className="card">
          <h2 className="section-title" style={{ fontSize: '1.5rem', marginTop: 0 }}>Create your workspace</h2>
          <AuthForm mode="signup" />
          <p className="form-note" style={{ marginTop: 14 }}>
            Already have an account? <a href="/login">Sign in</a>.
          </p>
        </section>
      </div>
    </main>
  );
}
