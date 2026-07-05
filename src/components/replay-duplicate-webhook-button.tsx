'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface ReplayDuplicateWebhookButtonProps {
  orderId: string;
  paymentId: string;
}

export function ReplayDuplicateWebhookButton({ orderId, paymentId }: ReplayDuplicateWebhookButtonProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleReplay() {
    setIsLoading(true);
    setStatus(null);

    try {
      const response = await fetch('/api/webhooks/razorpay', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-register-karo-demo': '1'
        },
        body: JSON.stringify({
          id: `razorpay:${paymentId}`,
          event: 'payment.captured',
          payload: {
            payment: {
              entity: {
                id: paymentId,
                order_id: orderId,
                status: 'captured',
                notes: {}
              }
            }
          }
        })
      });

      const data = (await response.json()) as { handled?: boolean; duplicate?: boolean; reason?: string; error?: string };
      if (!response.ok || data.error) {
        setStatus(data.error ?? 'Unable to replay webhook.');
        return;
      }

      if (data.duplicate) {
        setStatus('Duplicate webhook ignored exactly once.');
      } else if (data.handled) {
        setStatus('Webhook handled again.');
      } else {
        setStatus(data.reason ?? 'Webhook not applied.');
      }

      router.refresh();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="layout-stack">
      <button className="button button-secondary" disabled={isLoading} onClick={handleReplay}>
        {isLoading ? 'Replaying...' : 'Replay duplicate webhook'}
      </button>
      {status ? <div className="notice">{status}</div> : null}
    </div>
  );
}