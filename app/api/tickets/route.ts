import { NextResponse } from 'next/server';
import { assertSafeMutation, hashedIp, jsonError, readJson } from '@/lib/security/http';
import { requireActor } from '@/lib/security/auth';
import { createTicketSchema } from '@/lib/validation/schemas';
import { issueTicket } from '@/lib/tickets/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/tickets — génère un ticket (ADMIN, SUPER_ADMIN). Le token n'est JAMAIS renvoyé. */
export async function POST(request: Request) {
  try {
    assertSafeMutation(request);
    const actor = await requireActor(['SUPER_ADMIN', 'ADMIN']);
    const input = createTicketSchema.parse(await readJson(request));
    const ticket = await issueTicket(actor, hashedIp(request), input);
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
