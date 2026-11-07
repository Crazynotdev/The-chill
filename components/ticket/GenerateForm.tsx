'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { TicketRow } from '@/types';

async function fetchPdfBlob(id: string): Promise<Blob> {
  const res = await fetch(`/api/tickets/${id}/pdf`);
  if (!res.ok) throw new Error('PDF indisponible');
  return res.blob();
}

export default function GenerateForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState<TicketRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    setTicket(null);
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantName: name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Création impossible');
      setTicket(body.ticket as TicketRow);
      setName('');
      router.refresh(); // met à jour les statistiques et la liste
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }

  async function download() {
    if (!ticket) return;
    try {
      const blob = await fetchPdfBlob(ticket.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ticket.ticket_code}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Téléchargement impossible');
    }
  }

  async function print() {
    if (!ticket) return;
    try {
      const url = URL.createObjectURL(await fetchPdfBlob(ticket.id));
      const frame = document.createElement('iframe');
      frame.style.display = 'none';
      frame.src = url;
      frame.onload = () => frame.contentWindow?.print();
      document.body.appendChild(frame);
    } catch {
      setError('Impression impossible');
    }
  }

  async function share() {
    if (!ticket) return;
    try {
      const file = new File([await fetchPdfBlob(ticket.id)], `${ticket.ticket_code}.pdf`, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Ticket NUIT SANS FIN' });
      } else {
        await download();
        setNotice('Partage direct indisponible sur cet appareil : le PDF a été téléchargé.');
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setError('Partage impossible');
    }
  }

  return (
    <section className="card">
      <h2 className="text-lg font-bold">Générer un pass</h2>
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
        <div className="flex-1">
          <label htmlFor="participant" className="label">
            Nom du client
          </label>
          <input
            id="participant"
            className="input"
            placeholder="Ex. Jean Dupont"
            maxLength={80}
            autoComplete="off"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary sm:min-w-52" disabled={loading || name.trim().length < 2}>
          {loading ? 'Génération…' : 'GÉNÉRER LE PASS'}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      {ticket && (
        <div className="mt-4 animate-rise rounded-xl border border-ok/30 bg-ok/5 p-4" role="status">
          <p className="text-xs font-semibold uppercase tracking-wider text-ok">Pass créé</p>
          <p className="mt-1 text-xl font-bold">{ticket.participant_name}</p>
          <p className="font-mono text-accent2">{ticket.ticket_code}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={download}>
              Télécharger le PDF
            </button>
            <button type="button" className="btn-ghost" onClick={print}>
              Imprimer
            </button>
            <button type="button" className="btn-ghost" onClick={share}>
              Partager
            </button>
            <a className="btn-ghost" href={`/tickets/${ticket.id}`}>
              Voir le détail
            </a>
          </div>
          {notice && <p className="mt-3 text-sm text-mute">{notice}</p>}
        </div>
      )}
    </section>
  );
}
