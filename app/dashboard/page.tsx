import type { Metadata } from 'next';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import StatCard from '@/components/dashboard/StatCard';
import GenerateForm from '@/components/ticket/GenerateForm';
import StatusBadge from '@/components/ticket/StatusBadge';
import { requirePageActor } from '@/lib/security/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';
import type { TicketStatus } from '@/types';

export const metadata: Metadata = { title: 'Tableau de bord' };
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const actor = await requirePageActor(['SUPER_ADMIN', 'ADMIN']);
  // Client lié à la session : la RLS filtre elle-même les lectures.
  const supabase = createSupabaseServer();

  const count = async (status?: TicketStatus) => {
    let q = supabase.from('tickets').select('id', { count: 'exact', head: true });
    if (status) q = q.eq('status', status);
    const { count: n } = await q;
    return n ?? 0;
  };
  const [total, used, active, revoked, recent] = await Promise.all([
    count(),
    count('USED'),
    count('ACTIVE'),
    count('REVOKED'),
    supabase
      .from('tickets')
      .select('id, ticket_code, participant_name, status, issued_at')
      .order('created_at', { ascending: false })
      .limit(8),
  ]);

  return (
    <AppShell actor={actor} active="/dashboard">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total des tickets" value={total} />
        <StatCard label="Tickets validés" value={used} tone="accent" />
        <StatCard label="Tickets non utilisés" value={active} tone="ok" />
        <StatCard label="Tickets révoqués" value={revoked} tone="bad" />
      </div>

      <div className="mt-6">
        <GenerateForm />
      </div>

      <section className="card mt-6 overflow-hidden !p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-lg font-bold">Derniers tickets</h2>
          <Link href="/tickets" className="text-sm text-accent2 hover:underline">
            Tout voir →
          </Link>
        </div>
        {recent.data && recent.data.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-y border-line bg-white/[.02]">
                <tr>
                  <th className="th">Participant</th>
                  <th className="th">Code</th>
                  <th className="th">Statut</th>
                  <th className="th">Émis le</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recent.data.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[.03]">
                    <td className="td font-medium">
                      <Link href={`/tickets/${t.id}`} className="hover:text-accent2">
                        {t.participant_name}
                      </Link>
                    </td>
                    <td className="td font-mono text-mute">{t.ticket_code}</td>
                    <td className="td">
                      <StatusBadge status={t.status as TicketStatus} />
                    </td>
                    <td className="td text-mute">{formatDateTime(t.issued_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 pb-6 text-sm text-mute">Aucun ticket pour le moment. Générez le premier ci-dessus.</p>
        )}
      </section>
    </AppShell>
  );
}
