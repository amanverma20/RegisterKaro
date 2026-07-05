'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

interface AuthFormProps {
  mode: 'login' | 'signup';
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const payload = {
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      name: String(formData.get('name') ?? '')
    };

    startTransition(async () => {
      const endpoint = mode === 'signup' ? '/api/auth/register' : '/api/auth/login';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const raw = await response.text();
      let data: { error?: string } = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as { error?: string };
        } catch {
          data = { error: raw };
        }
      }
      if (!response.ok) {
        setError(data.error ?? 'Something went wrong');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    });
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      {mode === 'signup' ? (
        <label className="form-label">
          Full name
          <input name="name" className="input" placeholder="Aarav Mehta" required />
        </label>
      ) : null}
      <label className="form-label">
        Email
        <input name="email" type="email" className="input" placeholder="you@company.com" required />
      </label>
      <label className="form-label">
        Password
        <div style={{ position: 'relative' }}>
          <input
            name="password"
            type={showPassword ? 'text' : 'password'}
            className="input"
            placeholder="••••••••"
            required
            minLength={8}
            style={{ paddingRight: '3.25rem' }}
          />
          <button
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((current) => !current)}
            style={{
              position: 'absolute',
              right: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              border: 'none',
              background: 'transparent',
              color: 'var(--muted, #94a3b8)',
              cursor: 'pointer',
              padding: 0,
              fontSize: '1rem',
              lineHeight: 1
            }}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </label>
      {error ? <div className="notice">{error}</div> : null}
      <button className="button button-primary" type="submit" disabled={isPending}>
        {isPending ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create account'}
      </button>
    </form>
  );
}
