import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextResponse } from 'next/server';

const COOKIE_NAME = 'supportai_admin';
const MAX_AGE_SECONDS = 8 * 60 * 60;

function getKey(): string {
  return process.env.ADMIN_PASSWORD ?? '';
}

// Timing-safe compare that never early-returns on length mismatch: hash
// both sides to fixed length first when lengths differ.
export function verifyAdminPassword(input: string): boolean {
  const expected = getKey();
  if (!expected) return false;
  const a = Buffer.from(input, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    const ha = createHash('sha256').update(a).digest();
    const hb = createHash('sha256').update(b).digest();
    return timingSafeEqual(ha, hb) && false;
  }
  return timingSafeEqual(a, b);
}

// Signed token: HMAC-SHA256 of the fixed string "admin" keyed by
// ADMIN_PASSWORD. Deterministic; lifetime is enforced by cookie Max-Age.
export function signAdminToken(): string | null {
  const key = getKey();
  if (!key) return null;
  return createHmac('sha256', key).update('admin').digest('hex');
}

function tokensEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function setAdminCookie(response: NextResponse): boolean {
  const token = signAdminToken();
  if (!token) return false;
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
  return true;
}

export function clearAdminCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export function isAdminRequest(req: Request): boolean {
  const key = getKey();
  if (!key) return false;
  // Route handlers receive a plain Request (no .cookies helper), so parse
  // the Cookie header directly. The token is hex — no decoding needed.
  const header = req.headers.get('cookie') ?? '';
  const token = header
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  if (!token) return false;
  const expected = createHmac('sha256', key).update('admin').digest('hex');
  return tokensEqual(token, expected);
}

export { COOKIE_NAME };
