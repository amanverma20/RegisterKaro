import { createPlanChangeCheckout, createSubscriptionCheckout } from '@/lib/billing';
import { getAuthenticatedUserFromRequest } from '@/lib/http';
import { getStore, normalizePlanId } from '@/lib/store';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  planId: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const store = await getStore();
  const user = await getAuthenticatedUserFromRequest(store, request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid checkout payload' }, { status: 400 });
  }

  const planId = normalizePlanId(parsed.data.planId);
  const subscription = await store.getSubscriptionByUserId(user.id);
  const checkout = subscription?.planId && subscription.planId !== planId
    ? await createPlanChangeCheckout(store, user, planId)
    : await createSubscriptionCheckout(store, user, planId);

  return NextResponse.json(checkout);
}
