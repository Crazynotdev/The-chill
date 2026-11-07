import { NextResponse } from 'next/server';
import { hashedIp, jsonError, ApiError } from '@/lib/security/http';
import { requireActor } from '@/lib/security/auth';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { writeAudit } from '@/lib/security/audit';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { uuidSchema } from '@/lib/validation/schemas';
import { PDF_BUCKET } from '@/lib/tickets/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/tickets/:id/pdf — télécharge le PDF (ADMIN+), journalisé. Le bucket est privé. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const actor = await requireActor(['SUPER_ADMIN', 'ADMIN']);
    await enforceRateLimit(`pdf:${actor.id}`, 60, 60);
    const id = uuidSchema.parse(params.id);

    const admin = createSupabaseAdmin();
    const { data: ticket } = await admin
      .from('tickets')
      .select('ticket_code, pdf_path')
      .eq('id', id)
      .maybeSingle();
    if (!ticket?.pdf_path) throw new ApiError(404, 'NOT_FOUND', 'PDF introuvable');

    const { data: file, error } = await admin.storage.from(PDF_BUCKET).download(ticket.pdf_path);
    if (error || !file) throw new ApiError(404, 'NOT_FOUND', 'PDF introuvable');

    await writeAudit(actor, hashedIp(request), 'TICKET_DOWNLOADED', 'ticket', id, { ticket_code: ticket.ticket_code });

    return new NextResponse(await file.arrayBuffer(), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${ticket.ticket_code}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
