import { handleWebhookEvent } from '@/lib/billing';
import { getStore } from '@/lib/store';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';

function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export async function POST(request: Request) {
  const store = await getStore();
  const rawBody = await request.text();
  const isDemo = request.headers.get('x-register-karo-demo') === '1' || !process.env.STRIPE_WEBHOOK_SECRET;

  let event: { id: string; type: string; data: { object: Record<string, any> } };

  if (isDemo) {
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid demo webhook payload' }, { status: 400 });
    }
  } else {
    const stripe = getStripeClient();
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 500 });
    }

    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing Stripe signature' }, { status: 400 });
    }

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET as string) as any;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid webhook';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const result = await handleWebhookEvent(store, event, isDemo ? 'mock' : 'stripe');
  return NextResponse.json(result);
}
