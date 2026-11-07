import { NextResponse } from 'next/server';
import { assertSafeMutation, hashedIp, jsonError } from '@/lib/security/http';
import { requireActor } from '@/lib/security/auth';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { writeAudit } from '@/lib/security/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Appelé par la page de connexion après une authentification réussie : journalise la connexion. */
export async function POST(request: Request) {
  try {
    assertSafeMutation(request);
    const actor = await requireActor(['SUPER_ADMIN', 'ADMIN', 'SCANNER']);
    await enforceRateLimit(`login-event:${actor.id}`, 20, 60);
    await writeAudit(actor, hashedIp(request), 'LOGIN', 'user', actor.id, {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
