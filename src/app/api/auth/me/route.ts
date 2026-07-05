import { getAuthenticatedUserFromRequest } from '@/lib/http';
import { getStore } from '@/lib/store';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const store = await getStore();
  const user = await getAuthenticatedUserFromRequest(store, request);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}
