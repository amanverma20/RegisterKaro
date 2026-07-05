'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface MockCheckoutActionsProps {
  sessionId: string;
}

export function MockCheckoutActions({ sessionId }: MockCheckoutActionsProps) {
  const router = useRouter();
  const [result, setResult] = useState<string | null>(null);

  async function emit(eventType: 'checkout.session.completed' | 'invoice.paid' | 'customer.subscription.deleted' | 'customer.subscription.updated') {
    setResult(null);
    const response = await fetch('/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-register-karo-demo': '1'
      },
      body: JSON.stringify({
        id: `${eventType}:${sessionId}`,
        type: eventType,
        data: {
          object: {
            id: sessionId,
            checkout_session_id: sessionId,
            payment_intent: `${sessionId}_pi`,
            invoice: `${sessionId}_inv`,
            metadata: {}
          }
        }
      })
    });

    const payload = (await response.json()) as { handled?: boolean; duplicate?: boolean; reason?: string };
    setResult(payload.duplicate ? 'Duplicate event ignored exactly once.' : payload.handled ? 'Webhook applied.' : payload.reason ?? 'Event ignored.');
    router.refresh();
  }

  return (
    <div className="layout-stack">
      <div className="notice">
        Demo checkout session: <strong>{sessionId}</strong>
      </div>
      <div className="row-actions">
        <button className="button button-primary" onClick={() => emit('checkout.session.completed')}>
          Confirm payment
        </button>
        <button className="button button-secondary" onClick={() => emit('checkout.session.completed')}>
          Replay duplicate webhook
        </button>
      </div>
      <div className="row-actions">
        <button className="button button-danger" onClick={() => emit('customer.subscription.deleted')}>
          Simulate cancellation
        </button>
        <button className="button button-secondary" onClick={() => emit('customer.subscription.updated')}>
          Simulate subscription update
        </button>
      </div>
      {result ? <div className="notice">{result}</div> : null}
    </div>
  );
}
