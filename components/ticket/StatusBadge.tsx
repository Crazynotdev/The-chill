import type { TicketStatus } from '@/types';

const MAP: Record<TicketStatus, { label: string; cls: string }> = {
  ACTIVE: { label: 'Actif', cls: 'border-ok/40 bg-ok/10 text-ok' },
  USED: { label: 'Utilisé', cls: 'border-line bg-white/5 text-mute' },
  REVOKED: { label: 'Révoqué', cls: 'border-bad/40 bg-bad/10 text-bad' },
  EXPIRED: { label: 'Expiré', cls: 'border-warn/40 bg-warn/10 text-warn' },
};

export default function StatusBadge({ status }: { status: TicketStatus }) {
  const s = MAP[status];
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>
  );
}
