'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface RazorpayWindow extends Window {
  Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  handler: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  prefill: {
    name: string;
    email: string;
  };
  notes?: Record<string, string>;
  theme?: {
    color: string;
  };
}

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: () => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayCheckoutActionsProps {
  publicKey: string | null;
  orderId: string;
  paymentId: string;
  amountMinor: number;
  currency: string;
  planName: string;
  customerName: string;
  customerEmail: string;
}

function loadRazorpayScript() {
  return new Promise<boolean>((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }

    if (window.Razorpay) {
      resolve(true);
      return;
    }

    const existing = document.getElementById('razorpay-checkout-sdk');
    if (existing) {
      existing.addEventListener('load', () => resolve(true), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'razorpay-checkout-sdk';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

async function postRazorpayConfirmation(payload: {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}) {
  const response = await fetch('/api/webhooks/razorpay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return (await response.json()) as { handled?: boolean; duplicate?: boolean; reason?: string; error?: string };
}

async function postRazorpayFailure(payload: { orderId: string; paymentId: string; reason?: string }) {
  const response = await fetch('/api/webhooks/razorpay', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-register-karo-demo': '1'
    },
    body: JSON.stringify({
      id: `razorpay-failed:${payload.orderId}`,
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: payload.paymentId,
            order_id: payload.orderId,
            status: 'failed',
            notes: {},
            error_description: payload.reason ?? 'Payment failed'
          }
        }
      }
    })
  });

  return (await response.json()) as { handled?: boolean; duplicate?: boolean; reason?: string; error?: string };
}

export function RazorpayCheckoutActions({
  publicKey,
  orderId,
  paymentId,
  amountMinor,
  currency,
  planName,
  customerName,
  customerEmail
}: RazorpayCheckoutActionsProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);
  const [lastPayload, setLastPayload] = useState<{
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadRazorpayScript();
  }, []);

  const canOpenCheckout = useMemo(() => Boolean(publicKey), [publicKey]);

  async function confirmWithServer(payload: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) {
    const result = await postRazorpayConfirmation(payload);
    if (result.error) {
      setStatus(result.error);
      return;
    }

    if (result.duplicate) {
      setStatus('Duplicate Razorpay callback ignored exactly once.');
      router.replace(`/checkout/success?session_id=${encodeURIComponent(orderId)}`);
    } else if (result.handled) {
      setStatus('Payment confirmed and webhook applied.');
      router.replace(`/checkout/success?session_id=${encodeURIComponent(orderId)}`);
    } else {
      setStatus(result.reason ?? 'Razorpay event ignored.');
    }
  }

  async function handleReplay() {
    if (!lastPayload) return;
    setIsLoading(true);
    try {
      await confirmWithServer(lastPayload);
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePay() {
    setStatus(null);
    setIsLoading(true);

    try {
      const checkoutCurrency = currency.toUpperCase();
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        setStatus('Unable to load Razorpay Checkout. Check your network and public key.');
        return;
      }

      if (!publicKey) {
        setStatus('Missing NEXT_PUBLIC_RAZORPAY_KEY_ID.');
        return;
      }

      const checkout = new window.Razorpay({
        key: publicKey,
        amount: amountMinor,
        currency: checkoutCurrency,
        name: 'RegisterKaro',
        description: `${planName} subscription`,
        order_id: orderId,
        prefill: {
          name: customerName,
          email: customerEmail
        },
        notes: {
          paymentId,
          planName
        },
        theme: {
          color: '#38bdf8'
        },
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          const payload = {
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature
          };
          setLastPayload(payload);
          await confirmWithServer(payload);
        }
      });

      checkout.on('payment.failed', () => {
        void postRazorpayFailure({ orderId, paymentId, reason: 'Razorpay reported a payment failure before confirmation.' }).then((result) => {
          if (result.error) {
            setStatus(result.error);
            return;
          }
          setStatus('Razorpay reported a payment failure and the state was recorded.');
          router.refresh();
        });
      });

      checkout.open();
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="layout-stack">
      <div className="notice">
        Razorpay test mode order: <strong>{orderId}</strong>
      </div>
      <div className="notice">
        Use a Razorpay test card, then the server will verify the callback signature and apply the webhook exactly once.
      </div>
      <div className="row-actions">
        <button className="button button-primary" disabled={isLoading || !canOpenCheckout} onClick={handlePay}>
          {isLoading ? 'Opening Razorpay...' : 'Pay with Razorpay'}
        </button>
        <button className="button button-secondary" disabled={!lastPayload || isLoading} onClick={handleReplay}>
          Replay duplicate callback
        </button>
      </div>
      {status ? <div className="notice">{status}</div> : null}
    </div>
  );
}
