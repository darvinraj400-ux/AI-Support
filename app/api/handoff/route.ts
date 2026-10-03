import { z } from 'zod';
import { Resend } from 'resend';
import { createAdminClient } from '@/lib/supabase';

const BodySchema = z.object({
  sessionId: z.string().uuid(),
  email: z.string().email(),
  reason: z.string().max(1000).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const { sessionId, email, reason } = parsed.data;

  const db = createAdminClient();

  const { data: conv, error: convErr } = await db
    .from('conversations')
    .select('id')
    .eq('session_id', sessionId)
    .maybeSingle();
  if (convErr) {
    console.error('handoff: conversation lookup failed:', convErr.message);
    return Response.json({ error: 'Lookup failed' }, { status: 500 });
  }
  if (!conv) {
    // Uniform success: no 404/200 oracle for session enumeration.
    console.error('handoff: unknown session_id (no-op):', sessionId);
    return Response.json({ ok: true });
  }

  // limit(1) instead of maybeSingle: older conversations may hold more than
  // one handoffs row (pre-dedup-guard), and maybeSingle errors on multiples.
  const { data: rows, error: selErr } = await db
    .from('handoffs')
    .select('id')
    .eq('conversation_id', conv.id)
    .limit(1);
  if (selErr) {
    console.error('handoff: handoffs lookup failed:', selErr.message);
    return Response.json({ error: 'Lookup failed' }, { status: 500 });
  }

  if (rows && rows.length > 0) {
    const { error: updErr } = await db
      .from('handoffs')
      .update({ email, ...(reason !== undefined ? { reason } : {}) })
      .eq('conversation_id', conv.id);
    if (updErr) {
      console.error('handoff: update failed:', updErr.message);
      return Response.json({ error: 'Update failed' }, { status: 500 });
    }
  } else {
    const { error: insErr } = await db.from('handoffs').insert({
      conversation_id: conv.id,
      email,
      reason: reason ?? null,
    });
    if (insErr) {
      console.error('handoff: insert failed:', insErr.message);
      return Response.json({ error: 'Insert failed' }, { status: 500 });
    }
  }

  // Notification email is best-effort: the DB write above is the source of
  // truth, so any send failure is logged and the request still succeeds.
  const supportEmail = process.env.SUPPORT_EMAIL;
  const apiKey = process.env.RESEND_API_KEY;
  if (!supportEmail || !apiKey) {
    console.error('handoff: email skipped (missing RESEND_API_KEY or SUPPORT_EMAIL)');
  } else {
    try {
      const resend = new Resend(apiKey);
      // Never derive the link from the request host (Host-header poisoning).
      // APP_URL is allowlisted config; omit the line entirely if unset.
      let adminUrl: string | null = null;
      const appUrl = process.env.APP_URL;
      if (appUrl) {
        try {
          adminUrl = new URL('/admin/conversations', appUrl).toString();
        } catch {
          console.error('handoff: invalid APP_URL, omitting admin link');
        }
      }
      const lines = [
        `Conversation: ${conv.id}`,
        `User email: ${email}`,
        `Reason: ${reason ?? '(none provided)'}`,
      ];
      if (adminUrl) lines.push(`Review: ${adminUrl}`);
      // NOTE: resend.emails.send resolves (does not throw) on API errors,
      // returning { data, error } — so check error explicitly.
      const { error: sendError } = await resend.emails.send({
        from: 'SupportAI <support@nimbusanalytics.io>',
        to: supportEmail,
        subject: `[SupportAI] Handoff request — ${email}`,
        text: lines.join('\n'),
      });
      if (sendError) {
        console.error('handoff: email send failed:', sendError);
      }
    } catch (e) {
      console.error('handoff: email send failed:', e);
    }
  }

  return Response.json({ ok: true });
}
