import { AUTH_COOKIE_NAME, verifySessionToken } from '@/lib/auth';
import { type DataStore } from '@/lib/store';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

export function getTokenFromRequest(request: NextRequest) {
  return request.cookies.get(AUTH_COOKIE_NAME)?.value ?? null;
}

export async function getTokenFromCookies() {
  return (await cookies()).get(AUTH_COOKIE_NAME)?.value ?? null;
}

export async function getAuthenticatedUserFromRequest(store: DataStore, request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  try {
    const payload = verifySessionToken(token);
    const user = await store.findUserById(payload.sub);
    return user ? { id: user.id, email: user.email, name: user.name } : null;
  } catch {
    return null;
  }
}

export async function getAuthenticatedUserFromCookies(store: DataStore) {
  const token = await getTokenFromCookies();
  if (!token) return null;
  try {
    const payload = verifySessionToken(token);
    const user = await store.findUserById(payload.sub);
    return user ? { id: user.id, email: user.email, name: user.name } : null;
  } catch {
    return null;
  }
}
