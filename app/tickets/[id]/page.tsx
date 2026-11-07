import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import AppShell from '@/components/layout/AppShell';
import StatusBadge from '@/components/ticket/StatusBadge';
import TicketActions from '@/components/ticket/TicketActions';
import { requirePageActor } from '@/lib/security/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { uuidSchema } from '@/lib/validation/schemas';
import { formatDateTime } from '@/lib/format';
import type { TicketRow, TicketStatus } from '@/types';

export const metadata: Metadata = { title: 'Détail du ticket' };
export const dynamic = 'force-dynamic';

const ACTION_LABEL: Record<string, string> = {
  TICKET_CREATED: 'Ticket créé',
  TICKET_DOWNLOADED: 'PDF téléchargé',
  TICKET_REVOKED: 'Ticket révoqué',
  TICKET_REACTIVATED: 'Ticket réactivé',
  TICKET_VALIDATED: 'Entrée validée',
  TICKET_CHECKED: 'Vérification (sans consommer)',
  TICKET_SCAN_REJECTED: 'Scan refusé',
};

const RESULT_LABEL: Record<string, string> = {
  VALID: 'Valide',
  ALREADY_USED: 'Déjà utilisé',
  INVALID: 'Invalide',
  REVOKED: 'Révoqué',
  EXPIRED: 'Expiré',
  EVENT_INACTIVE: 'Événement inactif',
};

export default async function TicketDetailPage({ params }: { params: { id: string } }) {
  const actor = await requirePageActor(['SUPER_ADMIN', 'ADMIN']);
  const parsed = uuidSchema.safeParse(params.id);
  if (!parsed.success) notFound();

  const supabase = createSupabaseServer();
  const { data } = await supabase.from('tickets').select('*, events(name)').eq('id', parsed.data).maybeSingle();
  if (!data) notFound();
  const ticket = data as TicketRow & { events: { name: string } | null };

  const [{ data: scans }, { data: audits }] = await Promise.all([
    supabase
      .from('scan_logs')
      .select('id, result, mode, checkpoint, created_at')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('audit_logs')
      .select('id, action, actor_role, created_at, metadata')
      .eq('entity_type', 'ticket')
      .eq('entity_id', ticket.id)
      .neq('action', 'TICKET_SCAN_REJECTED')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const rows: [string, React.ReactNode][] = [
    ['Participant', ticket.participant_name],
    ['Code', <span key="c" className="font-mono">{ticket.ticket_code}</span>],
    ['Événement', ticket.events?.name ?? '—'],
    ['Statut', <StatusBadge key="s" status={ticket.status as TicketStatus} />],
    ['Émis le', formatDateTime(ticket.issued_at)],
    ['Validé le', formatDateTime(ticket.validated_at)],
    ['Point de contrôle', ticket.validation_location ?? '—'],
    ['Motif de révocation', ticket.revoke_reason ?? '—'],
  ];

  return (
    <AppShell actor={actor} active="/tickets">
      <Link href="/tickets" className="text-sm text-mute hover:text-ink">
        ← Tous les tickets
      </Link>
      <h1 className="mb-4 mt-2 text-2xl font-black">{ticket.participant_name}</h1>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <section className="card">
          <dl className="divide-y divide-line">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <dt className="text-mute">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5">
            <TicketActions id={ticket.id} status={ticket.status as TicketStatus} role={actor.role} />
          </div>
        </section>

        <section className="card">
          <h2 className="mb-3 text-lg font-bold">Historique</h2>
          <ul className="space-y-2 text-sm">
            {(audits ?? []).map((a) => (
              <li key={`a${a.id}`} className="flex justify-between gap-3 border-b border-line pb-2">
                <span>{ACTION_LABEL[a.action] ?? a.action}</span>
                <span className="text-mute">{formatDateTime(a.created_at)}</span>
              </li>
            ))}
            {(scans ?? []).map((s) => (
              <li key={`s${s.id}`} className="flex justify-between gap-3 border-b border-line pb-2 text-mute">
                <span>
                  Scan {s.mode === 'CHECK' ? '(vérif.)' : ''} — {RESULT_LABEL[s.result] ?? s.result}
                  {s.checkpoint ? ` · ${s.checkpoint}` : ''}
                </span>
                <span>{formatDateTime(s.created_at)}</span>
              </li>
            ))}
            {(audits ?? []).length + (scans ?? []).length === 0 && <li className="text-mute">Aucun événement.</li>}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
