import type { Metadata } from 'next';
import AppShell from '@/components/layout/AppShell';
import { requirePageActor } from '@/lib/security/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { formatDateTime } from '@/lib/format';

export const metadata: Metadata = { title: 'Audit' };
export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const actor = await requirePageActor(['SUPER_ADMIN', 'ADMIN']);
  const { data } = await createSupabaseServer()
    .from('audit_logs')
    .select('id, action, actor_role, entity_type, entity_id, session_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <AppShell actor={actor} active="/audit">
      <h1 className="mb-1 text-2xl font-black">Journal d’audit</h1>
      <p className="mb-4 text-sm text-mute">200 dernières actions · journal immuable (aucune modification ni suppression possible).</p>
      <div className="card overflow-hidden !p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-line bg-white/[.02]">
              <tr>
                <th className="th">Date</th>
                <th className="th">Action</th>
                <th className="th">Rôle</th>
                <th className="th">Objet</th>
                <th className="th">Session</th>
                <th className="th">Détail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(data ?? []).map((l) => (
                <tr key={l.id} className="hover:bg-white/[.03]">
                  <td className="td whitespace-nowrap text-mute">{formatDateTime(l.created_at)}</td>
                  <td className="td font-mono text-xs">{l.action}</td>
                  <td className="td text-mute">{l.actor_role ?? '—'}</td>
                  <td className="td font-mono text-xs text-mute">
                    {l.entity_type ? `${l.entity_type}:${String(l.entity_id).slice(0, 8)}` : '—'}
                  </td>
                  <td className="td font-mono text-xs text-mute">{l.session_id ? String(l.session_id).slice(0, 8) : '—'}</td>
                  <td className="td max-w-xs truncate font-mono text-xs text-mute">
                    {l.metadata && Object.keys(l.metadata).length ? JSON.stringify(l.metadata) : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
