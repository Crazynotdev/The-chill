import { NextResponse } from 'next/server';
import { assertSafeMutation, hashedIp, jsonError, readJson } from '@/lib/security/http';
import { requireActor } from '@/lib/security/auth';
import { scanSchema } from '@/lib/validation/schemas';
import { verifyScan } from '@/lib/tickets/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/scan — { input, mode?, checkpoint? }
 * Endpoint authentifié (SCANNER, ADMIN, SUPER_ADMIN) : un attaquant doit d'abord posséder un compte
 * du personnel pour tenter de deviner des tokens — en plus des 256 bits d'entropie, du rate limiting
 * et du verrouillage après échecs répétés.
 */
export async function POST(request: Request) {
  try {
    assertSafeMutation(request);
    const actor = await requireActor(['SUPER_ADMIN', 'ADMIN', 'SCANNER']);
    const input = scanSchema.parse(await readJson(request));
    const result = await verifyScan(actor, hashedIp(request), input);
    return NextResponse.json(result);
  } catch (e) {
    return jsonError(e);
  }
}
