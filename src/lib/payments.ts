import { getPlanById, type PaymentProvider, type PlanId } from '@/lib/domain';
import Stripe from 'stripe';

export interface CheckoutSessionRequest {
  userId: string;
  userEmail: string;
  planId: PlanId;
  paymentPurpose: 'new_subscription' | 'plan_change' | 'renewal';
  description: string;
}

export interface CheckoutSessionResult {
  provider: PaymentProvider;
  checkoutSessionId: string;
  paymentIntentId: string | null;
  checkoutUrl: string;
  publicKey: string | null;
}

function getBaseUrl() {
  return process.env.APP_URL ?? 'http://localhost:3000';
}

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return new Stripe(secretKey);
}

function getRazorpayKeyId() {
  return process.env.RAZORPAY_KEY_ID ?? null;
}

function getRazorpaySecret() {
  return process.env.RAZORPAY_KEY_SECRET ?? null;
}

function getPreferredPaymentProvider(): PaymentProvider {
  if (getRazorpayKeyId() && getRazorpaySecret()) return 'razorpay';
  if (process.env.STRIPE_SECRET_KEY) return 'stripe';
  return 'mock';
}

async function createRazorpayOrder(request: CheckoutSessionRequest, amountMinor: number) {
  const keyId = getRazorpayKeyId();
  const secret = getRazorpaySecret();
  if (!keyId || !secret) {
    throw new Error('Razorpay is not configured');
  }

  const receipt = `rk_${request.planId}_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;

  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      amount: amountMinor,
      currency: 'INR',
      receipt,
      notes: {
        userId: request.userId,
        planId: request.planId,
        purpose: request.paymentPurpose,
        description: request.description
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Razorpay order creation failed: ${body}`);
  }

  return (await response.json()) as { id: string };
}

export async function createCheckoutSession(request: CheckoutSessionRequest): Promise<CheckoutSessionResult> {
  const plan = getPlanById(request.planId);
  const provider = getPreferredPaymentProvider();

  if (provider === 'mock') {
    const checkoutSessionId = `mock_${crypto.randomUUID()}`;
    return {
      provider,
      checkoutSessionId,
      paymentIntentId: null,
      checkoutUrl: `${getBaseUrl()}/checkout/${checkoutSessionId}`,
      publicKey: null
    };
  }

  if (provider === 'razorpay') {
    const order = await createRazorpayOrder(request, plan.priceMinor);
    return {
      provider,
      checkoutSessionId: order.id,
      paymentIntentId: null,
      checkoutUrl: `${getBaseUrl()}/checkout/${order.id}`,
      publicKey: getRazorpayKeyId()
    };
  }

  const stripe = getStripeClient();
  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: request.userEmail,
    success_url: `${getBaseUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${getBaseUrl()}/checkout/cancelled`,
    metadata: {
      userId: request.userId,
      planId: request.planId,
      purpose: request.paymentPurpose
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'inr',
          product_data: {
            name: `${plan.name} plan`,
            description: request.description
          },
          unit_amount: plan.priceMinor,
          recurring: {
            interval: 'month'
          }
        }
      }
    ]
  });

  return {
    provider,
    checkoutSessionId: session.id,
    paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
    checkoutUrl: session.url ?? `${getBaseUrl()}/checkout/success?session_id=${session.id}`,
    publicKey: null
  };
}
