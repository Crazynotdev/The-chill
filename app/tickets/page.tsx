import type { Metadata } from 'next';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import StatusBadge from '@/components/ticket/StatusBadge';
import { requirePageActor } from '@/lib/security/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';
import type { TicketStatus } from '@/types';

export const metadata: Metadata = { title: 'Tickets' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 25;
const STATUSES: TicketStatus[] = ['ACTIVE', 'USED', 'REVOKED', 'EXPIRED'];

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; page?: string };
}) {
  const actor = await requirePageActor(['SUPER_ADMIN', 'ADMIN']);
  const supabase = createSupabaseServer();

  // Recherche : on retire les caractères réservés de la syntaxe PostgREST (, ( ) ) et les jokers.
  const q = (searchParams.q ?? '').replace(/[%_,()\\*]/g, ' ').trim().slice(0, 80);
  const status = STATUSES.find((s) => s === searchParams.status);
  const page = Math.max(1, Math.min(10_000, Number.parseInt(searchParams.page ?? '1', 10) || 1));
  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from('tickets')
    .select('id, ticket_code, participant_name, status, issued_at, validated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (q) query = query.or(`participant_name.ilike.%${q}%,ticket_code.ilike.%${q}%`);
  if (status) query = query.eq('status', status);
  const { data, count } = await query;

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set('q', q);
    if (status) sp.set('status', status);
    sp.set('page', String(p));
    return `/tickets?${sp.toString()}`;
  };

  return (
    <AppShell actor={actor} active="/tickets">
      <h1 className="mb-4 text-2xl font-black">Tickets</h1>

      <form className="card mb-4 flex flex-col gap-3 sm:flex-row" role="search">
        <input name="q" defaultValue={q} className="input flex-1" placeholder="Rechercher un nom ou un code…" />
        <select name="status" defaultValue={status ?? ''} className="input sm:w-44" aria-label="Statut">
          <option value="">Tous les statuts</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="btn-primary" type="submit">
          Rechercher
        </button>
      </form>

      <div className="card overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-line bg-white/[.02]">
              <tr>
                <th className="th">Participant</th>
                <th className="th">Code</th>
                <th className="th">Statut</th>
                <th className="th">Émis le</th>
                <th className="th">Validé le</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(data ?? []).map((t) => (
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
                  <td className="td text-mute">{formatDateTime(t.validated_at)}</td>
                </tr>
              ))}
              {(data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="td py-10 text-center text-mute">
                    Aucun ticket ne correspond à la recherche.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <nav className="mt-4 flex items-center justify-between text-sm text-mute" aria-label="Pagination">
        <span>
          {total.toLocaleString('fr-FR')} ticket{total > 1 ? 's' : ''} · page {page}/{pages}
        </span>
        <span className="flex gap-2">
          {page > 1 && (
            <Link className="btn-ghost !py-1.5" href={href(page - 1)}>
              ← Précédent
            </Link>
          )}
          {page < pages && (
            <Link className="btn-ghost !py-1.5" href={href(page + 1)}>
              Suivant →
            </Link>
          )}
        </span>
      </nav>
    </AppShell>
  );
}
