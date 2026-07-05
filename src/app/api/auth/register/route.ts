import { AUTH_COOKIE_NAME, getCookieConfig, hashPassword, signSessionToken } from '@/lib/auth';
import { getStore } from '@/lib/store';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(80)
});

export async function POST(request: Request) {
  const store = await getStore();
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid registration payload' }, { status: 400 });
  }

  const existing = await store.findUserByEmail(parsed.data.email);
  if (existing) {
    return NextResponse.json({ error: 'An account already exists for that email' }, { status: 409 });
  }

  const user = await store.createUser({
    email: parsed.data.email,
    name: parsed.data.name,
    passwordHash: await hashPassword(parsed.data.password)
  });

  const token = signSessionToken({ sub: user.id, email: user.email, name: user.name });
  const response = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
  response.cookies.set(AUTH_COOKIE_NAME, token, getCookieConfig());
  return response;
}
