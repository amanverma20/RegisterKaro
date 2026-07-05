import { cancelSubscription } from '@/lib/billing';
import { getAuthenticatedUserFromRequest } from '@/lib/http';
import { getStore } from '@/lib/store';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const store = await getStore();
  const user = await getAuthenticatedUserFromRequest(store, request);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const subscription = await cancelSubscription(store, user);
  if (!subscription) {
    return NextResponse.json({ error: 'No subscription to cancel' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, status: subscription.status, cancelAtPeriodEnd: subscription.cancelAtPeriodEnd });
}
