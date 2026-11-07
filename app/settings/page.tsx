import type { Metadata } from 'next';
import AppShell from '@/components/layout/AppShell';
import { requirePageActor } from '@/lib/security/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Paramètres' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const actor = await requirePageActor(['SUPER_ADMIN', 'ADMIN']);
  const supabase = createSupabaseServer();
  const [{ data: events }, { data: staff }] = await Promise.all([
    supabase.from('events').select('id, name, venue, starts_at, ticket_expires_at, is_active').order('created_at'),
    supabase.from('profiles').select('id, email, full_name, role, is_active').order('created_at'),
  ]);

  return (
    <AppShell actor={actor} active="/settings">
      <h1 className="mb-4 text-2xl font-black">Paramètres</h1>

      <section className="card mb-4">
        <h2 className="mb-3 text-lg font-bold">Événements</h2>
        <ul className="divide-y divide-line text-sm">
          {(events ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="font-semibold">{e.name}</span>
              <span className="text-mute">
                {e.venue ?? 'Lieu à confirmer'} · {e.starts_at ? formatDateTime(e.starts_at) : 'Date à confirmer'} ·{' '}
                {e.is_active ? 'actif' : 'inactif'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-mute">
          Lieu, date et expiration se modifient dans le SQL Editor Supabase (voir README) — l’édition depuis l’interface est prévue en V2.
        </p>
      </section>

      <section className="card">
        <h2 className="mb-3 text-lg font-bold">Équipe</h2>
        <ul className="divide-y divide-line text-sm">
          {(staff ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span>
                <span className="font-semibold">{p.full_name ?? p.email}</span>
                {p.full_name && <span className="ml-2 text-mute">{p.email}</span>}
              </span>
              <span className="text-mute">
                {p.role}
                {p.is_active ? '' : ' · désactivé'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-mute">
          Les comptes et rôles sont gérés via Supabase Auth + la table <code>profiles</code> (voir README).
        </p>
      </section>
    </AppShell>
  );
}
