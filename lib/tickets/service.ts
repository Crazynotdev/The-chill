import 'server-only';
import { randomUUID } from 'node:crypto';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { secretEnv } from '@/lib/env';
import { ApiError } from '@/lib/security/http';
import { enforceRateLimit } from '@/lib/security/rate-limit';
import { writeAudit } from '@/lib/security/audit';
import type { Actor } from '@/lib/security/auth';
import {
  generateTicketCode,
  generateValidationToken,
  hashToken,
  parseScanInput,
} from '@/lib/security/tokens';
import { buildVerifyUrl, generateQrPng } from '@/lib/qr';
import { buildTicketPdf } from '@/lib/pdf/ticket';
import type { CreateTicketInput, ScanInput, StatusActionInput } from '@/lib/validation/schemas';
import type { ScanResponse, TicketRow } from '@/types';

export const PDF_BUCKET = 'tickets-pdf';
const MAX_INVALID_SCANS = 15; // échecs tolérés par utilisateur …
const INVALID_WINDOW_MIN = 5; // … sur cette fenêtre, sinon verrouillage temporaire

interface EventRow {
  id: string;
  name: string;
  venue: string | null;
  starts_at: string | null;
}

async function resolveEvent(eventId?: string): Promise<EventRow> {
  const admin = createSupabaseAdmin();
  const query = admin.from('events').select('id, name, venue, starts_at').eq('is_active', true);
  const { data, error } = eventId
    ? await query.eq('id', eventId).maybeSingle()
    : await query.eq('slug', secretEnv().DEFAULT_EVENT_SLUG).maybeSingle();
  if (error) throw new ApiError(500, 'EVENT_LOOKUP_FAILED', 'Impossible de charger l’événement');
  if (!data) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Événement introuvable ou inactif');
  return data as EventRow;
}

/**
 * Émission d'un ticket.
 * Ordre voulu : génération → PDF → upload → insertion transactionnelle (ticket + audit).
 * Ainsi il n'existe jamais de ticket sans PDF, et un échec d'insertion ne laisse pas d'orphelin (nettoyé).
 * Une collision d'unicité (probabilité négligeable) déclenche un nouveau tirage.
 */
export async function issueTicket(actor: Actor, ipHash: string, input: CreateTicketInput): Promise<TicketRow> {
  await enforceRateLimit(`issue:${actor.id}`, 30, 60);

  const admin = createSupabaseAdmin();
  const event = await resolveEvent(input.eventId);
  const issuedAt = new Date();

  for (let attempt = 0; attempt < 5; attempt++) {
    const id = randomUUID();
    const code = generateTicketCode();
    const token = generateValidationToken();

    const qrPng = await generateQrPng(buildVerifyUrl(token));
    const pdf = await buildTicketPdf({
      participantName: input.participantName,
      ticketCode: code,
      qrPng,
      eventName: event.name,
      venue: event.venue,
      startsAt: event.starts_at ? new Date(event.starts_at) : null,
      issuedAt,
    });

    const pdfPath = `${event.id}/${id}.pdf`;
    const upload = await admin.storage.from(PDF_BUCKET).upload(pdfPath, pdf, {
      contentType: 'application/pdf',
      upsert: false,
    });
    if (upload.error) throw new ApiError(502, 'STORAGE_ERROR', 'Impossible d’enregistrer le PDF');

    const { data, error } = await admin.rpc('issue_ticket', {
      p_id: id,
      p_event_id: event.id,
      p_name: input.participantName,
      p_code: code,
      p_token_hash: hashToken(token),
      p_issued_at: issuedAt.toISOString(),
      p_pdf_path: pdfPath,
      p_actor: actor.id,
      p_session: actor.sessionId,
      p_ip_hash: ipHash,
    });

    if (error) {
      await admin.storage.from(PDF_BUCKET).remove([pdfPath]);
      if (error.code === '23505') continue; // collision : nouveau tirage
      if (error.message.includes('FORBIDDEN')) throw new ApiError(403, 'FORBIDDEN', 'Permissions insuffisantes');
      if (error.message.includes('EVENT_NOT_AVAILABLE')) throw new ApiError(409, 'EVENT_INACTIVE', 'Événement inactif');
      console.error('[issue_ticket]', error);
      throw new ApiError(500, 'ISSUE_FAILED', 'Création du ticket impossible');
    }
    return data as TicketRow;
  }
  throw new ApiError(500, 'COLLISION', 'Création impossible après plusieurs tentatives');
}

/**
 * Vérification d'un ticket scanné.
 * Garde-fous avant d'atteindre la base : rôle (appelant), débit, verrouillage après échecs répétés.
 * La décision elle-même (existence, statut, atomicité) est prise dans verify_ticket (SQL).
 */
export async function verifyScan(actor: Actor, ipHash: string, input: ScanInput): Promise<ScanResponse> {
  const admin = createSupabaseAdmin();
  await enforceRateLimit(`scan:${actor.id}`, 120, 60);

  const since = new Date(Date.now() - INVALID_WINDOW_MIN * 60_000).toISOString();
  const { count } = await admin
    .from('scan_logs')
    .select('id', { count: 'exact', head: true })
    .eq('scanned_by', actor.id)
    .eq('result', 'INVALID')
    .gte('created_at', since);
  if ((count ?? 0) >= MAX_INVALID_SCANS) {
    await writeAudit(actor, ipHash, 'SCAN_LOCKOUT', null, null, { invalid_in_window: count });
    throw new ApiError(429, 'SCAN_LOCKED', 'Trop de tickets invalides : scanner verrouillé quelques minutes');
  }

  const parsed = parseScanInput(input.input);
  // Une entrée illisible est envoyée sous forme de hash qui ne correspondra à rien → INVALID journalisé.
  const tokenHash =
    parsed?.kind === 'token' ? hashToken(parsed.token) : parsed ? null : hashToken(`unparsable:${input.input}`);
  const code = parsed?.kind === 'code' ? parsed.code : null;

  const { data, error } = await admin.rpc('verify_ticket', {
    p_token_hash: tokenHash,
    p_code: code,
    p_mode: input.mode,
    p_actor: actor.id,
    p_checkpoint: input.checkpoint,
    p_ip_hash: ipHash,
    p_session: actor.sessionId,
  });
  if (error) {
    if (error.message.includes('FORBIDDEN')) throw new ApiError(403, 'FORBIDDEN', 'Permissions insuffisantes');
    console.error('[verify_ticket]', error);
    throw new ApiError(500, 'VERIFY_FAILED', 'Vérification impossible');
  }
  return data as ScanResponse;
}

export async function changeTicketStatus(
  actor: Actor,
  ipHash: string,
  ticketId: string,
  input: StatusActionInput,
): Promise<TicketRow> {
  await enforceRateLimit(`status:${actor.id}`, 30, 60);
  const { data, error } = await createSupabaseAdmin().rpc('set_ticket_status', {
    p_ticket_id: ticketId,
    p_action: input.action,
    p_reason: input.reason ?? null,
    p_actor: actor.id,
    p_session: actor.sessionId,
    p_ip_hash: ipHash,
  });
  if (error) {
    const m = error.message;
    if (m.includes('FORBIDDEN')) throw new ApiError(403, 'FORBIDDEN', 'Permissions insuffisantes');
    if (m.includes('NOT_FOUND')) throw new ApiError(404, 'NOT_FOUND', 'Ticket introuvable');
    if (m.includes('ALREADY_REVOKED')) throw new ApiError(409, 'ALREADY_REVOKED', 'Ticket déjà révoqué');
    if (m.includes('NOT_REVOKED')) throw new ApiError(409, 'NOT_REVOKED', 'Le ticket n’est pas révoqué');
    console.error('[set_ticket_status]', error);
    throw new ApiError(500, 'STATUS_FAILED', 'Modification impossible');
  }
  return data as TicketRow;
}
