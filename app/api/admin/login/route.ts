import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setAdminCookie, verifyAdminPassword } from '@/lib/admin-auth';

const BodySchema = z.object({
  password: z.string(),
});

export async function POST(req: Request) {
  if (!process.env.ADMIN_PASSWORD) {
    return Response.json({ error: 'unavailable' }, { status: 500 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!verifyAdminPassword(parsed.data.password)) {
    // Slow brute force. No logging of attempts.
    await new Promise((r) => setTimeout(r, 500));
    return Response.json({ error: 'invalid' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  if (!setAdminCookie(res)) {
    return Response.json({ error: 'unavailable' }, { status: 500 });
  }
  return res;
}
