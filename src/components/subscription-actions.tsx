'use client';

import { PLANS, type PlanId } from '@/lib/domain';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

interface SubscriptionActionsProps {
  currentPlanId: PlanId | null;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
}

export function SubscriptionActions({ currentPlanId, subscriptionStatus, cancelAtPeriodEnd }: SubscriptionActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  async function createCheckout(planId: PlanId) {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId })
      });
      const data = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !data.checkoutUrl) {
        setMessage(data.error ?? 'Unable to create checkout');
        return;
      }
      router.push(data.checkoutUrl);
    });
  }

  async function cancelSubscription() {
    setMessage(null);
    startTransition(async () => {
      const response = await fetch('/api/subscription/cancel', {
        method: 'POST'
      });
      const data = (await response.json()) as { error?: string; status?: string };
      if (!response.ok) {
        setMessage(data.error ?? 'Could not cancel subscription');
        return;
      }
      setMessage(`Subscription ${data.status ?? 'updated'}.`);
      router.refresh();
    });
  }

  return (
    <div className="layout-stack">
      <div className="notice">
        {subscriptionStatus ? (
          <>
            Current subscription state: <strong>{subscriptionStatus}</strong>
            {cancelAtPeriodEnd ? ' (cancels at period end)' : ''}.
          </>
        ) : (
          <>No subscription yet. Pick a plan to start the checkout flow.</>
        )}
      </div>
      <div className="grid-3">
        {PLANS.map((plan) => {
          const active = currentPlanId === plan.id;
          return (
            <div className="card plan-card" key={plan.id}>
              <div className="pill-row">
                <span className={`status-chip ${active ? 'ok' : 'neutral'}`}>{active ? 'Current plan' : 'Available'}</span>
                <span className="status-chip neutral">{plan.name}</span>
              </div>
              <div className="plan-price">₹{plan.priceMinor / 100}/mo</div>
              <div className="muted">{plan.description}</div>
              <ul className="plan-list">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <button className="button button-primary" disabled={isPending} onClick={() => createCheckout(plan.id)}>
                {active ? 'Change to this plan' : 'Select plan'}
              </button>
            </div>
          );
        })}
      </div>
      <div className="row-actions">
        <button className="button button-secondary" disabled={isPending} onClick={() => router.refresh()}>
          Refresh state
        </button>
        <button className="button button-danger" disabled={isPending || !currentPlanId} onClick={cancelSubscription}>
          Cancel subscription
        </button>
      </div>
      {message ? <div className="notice">{message}</div> : null}
    </div>
  );
}
