import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Cookie gate for /admin. The layout cannot read the request path, and
// gating there would redirect-loop /admin/login — so enforcement lives
// here, where the path is visible. Uses Web Crypto (Edge-compatible);
// token format matches lib/admin-auth.ts: hex HMAC-SHA256 of "admin".
async function verifyToken(
  token: string,
  key: string
): Promise<boolean> {
  try {
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      enc.encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode('admin'));
    const hex = [...new Uint8Array(sig)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    if (hex.length !== token.length) return false;
    // Constant-time compare: accumulate, no early exit.
    let diff = 0;
    for (let i = 0; i < hex.length; i++) {
      diff |= hex.charCodeAt(i) ^ token.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/admin/login') return NextResponse.next();

  // ADMIN_PASSWORD is server-only (never NEXT_PUBLIC_), safe to read here.
  const key = process.env.ADMIN_PASSWORD ?? '';
  const token = req.cookies.get('supportai_admin')?.value;
  if (key && token && (await verifyToken(token, key))) {
    return NextResponse.next();
  }
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/admin/login';
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: '/admin/:path*',
};
