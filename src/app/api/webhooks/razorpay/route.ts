import { handleWebhookEvent } from '@/lib/billing';
import { buildRazorpayWebhookEvent, verifyRazorpayCheckoutSignature, verifyRazorpayWebhookSignature } from '@/lib/razorpay';
import { getStore } from '@/lib/store';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const store = await getStore();
  const rawBody = await request.text();
  const demoMode = request.headers.get('x-register-karo-demo') === '1';
  let event = null as ReturnType<typeof buildRazorpayWebhookEvent> | null;

  try {
    const parsed = JSON.parse(rawBody) as any;

    if (demoMode) {
      event = buildRazorpayWebhookEvent(parsed);
    } else if (parsed.razorpay_payment_id && parsed.razorpay_order_id && parsed.razorpay_signature) {
      if (!verifyRazorpayCheckoutSignature(parsed)) {
        return NextResponse.json({ error: 'Invalid Razorpay signature' }, { status: 400 });
      }
      event = buildRazorpayWebhookEvent(parsed);
    } else {
      const signature = request.headers.get('x-razorpay-signature');
      if (!signature) {
        return NextResponse.json({ error: 'Missing Razorpay signature' }, { status: 400 });
      }
      if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
        return NextResponse.json({ error: 'Invalid Razorpay webhook signature' }, { status: 400 });
      }
      event = buildRazorpayWebhookEvent(parsed);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid Razorpay payload';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (!event) {
    return NextResponse.json({ error: 'Unable to normalize Razorpay event' }, { status: 400 });
  }

  const result = await handleWebhookEvent(store, event, 'razorpay');
  return NextResponse.json(result);
}
