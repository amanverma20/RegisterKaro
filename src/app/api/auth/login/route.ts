import { AUTH_COOKIE_NAME, getCookieConfig, signSessionToken, verifyPassword } from '@/lib/auth';
import { getStore } from '@/lib/store';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export async function POST(request: Request) {
  const store = await getStore();
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid login payload' }, { status: 400 });
  }

  const user = await store.findUserByEmail(parsed.data.email);
  if (!user) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  await store.updateUserLastSeen(user.id);

  const token = signSessionToken({ sub: user.id, email: user.email, name: user.name });
  const response = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
  response.cookies.set(AUTH_COOKIE_NAME, token, getCookieConfig());
  return response;
}
