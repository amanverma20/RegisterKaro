import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export const AUTH_COOKIE_NAME = 'rk_session';

export interface SessionPayload {
  sub: string;
  email: string;
  name: string;
}

function getJwtSecret() {
  return process.env.JWT_SECRET ?? 'register-karo-dev-secret-change-me';
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export function signSessionToken(payload: SessionPayload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifySessionToken(token: string) {
  return jwt.verify(token, getJwtSecret()) as SessionPayload;
}

export function getCookieConfig() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  };
}
