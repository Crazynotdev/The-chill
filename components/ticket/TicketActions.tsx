'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role, TicketStatus } from '@/types';

/**
 * Les boutons affichés dépendent du rôle, mais ce n'est qu'un confort d'interface :
 * l'autorisation réelle est revérifiée côté serveur (route API + fonction SQL).
 */
export default function TicketActions({ id, status, role }: { id: string; status: TicketStatus; role: Role }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function change(action: 'REVOKE' | 'REACTIVATE') {
    let reason: string | undefined;
    if (action === 'REVOKE') {
      const answer = window.prompt('Motif de la révocation (optionnel) :', '');
      if (answer === null) return;
      reason = answer.trim() || undefined;
    } else if (!window.confirm('Réactiver ce ticket ?')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      });
      if (!res.ok) throw new Error((await res.json())?.error?.message ?? 'Action impossible');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inattendue');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className="btn-primary" href={`/api/tickets/${id}/pdf`} target="_blank" rel="noreferrer">
        Télécharger le PDF
      </a>
      {status !== 'REVOKED' && (
        <button type="button" className="btn-danger" disabled={busy} onClick={() => change('REVOKE')}>
          Révoquer
        </button>
      )}
      {status === 'REVOKED' && role === 'SUPER_ADMIN' && (
        <button type="button" className="btn-ghost" disabled={busy} onClick={() => change('REACTIVATE')}>
          Réactiver
        </button>
      )}
      {error && (
        <span role="alert" className="text-sm text-bad">
          {error}
        </span>
      )}
    </div>
  );
}
