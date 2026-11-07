import { NextResponse } from 'next/server';
import { assertSafeMutation, hashedIp, jsonError, readJson } from '@/lib/security/http';
import { requireActor } from '@/lib/security/auth';
import { statusActionSchema, uuidSchema } from '@/lib/validation/schemas';
import { changeTicketStatus } from '@/lib/tickets/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/tickets/:id/status — { action: 'REVOKE' | 'REACTIVATE', reason? }
 * REVOKE : ADMIN+ · REACTIVATE : SUPER_ADMIN (revérifié dans la fonction SQL).
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    assertSafeMutation(request);
    const actor = await requireActor(['SUPER_ADMIN', 'ADMIN']);
    const id = uuidSchema.parse(params.id);
    const input = statusActionSchema.parse(await readJson(request));
    const ticket = await changeTicketStatus(actor, hashedIp(request), id, input);
    return NextResponse.json({ ticket });
  } catch (e) {
    return jsonError(e);
  }
}
