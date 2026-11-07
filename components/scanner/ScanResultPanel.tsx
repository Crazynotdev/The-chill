'use client';

import { formatDate, formatTime } from '@/lib/format';
import type { ScanMode, ScanResponse, ScanResultCode } from '@/types';

type Tone = 'ok' | 'warn' | 'bad';

const CONFIG: Record<ScanResultCode, { tone: Tone; title: string; sub: string }> = {
  VALID: { tone: 'ok', title: 'TICKET AUTHENTIQUE', sub: 'ENTRÉE AUTORISÉE' },
  ALREADY_USED: { tone: 'warn', title: 'TICKET DÉJÀ UTILISÉ', sub: 'Ce ticket a déjà été validé.' },
  INVALID: { tone: 'bad', title: 'TICKET INVALIDE', sub: 'Ce ticket n’est pas reconnu par le système. ENTRÉE REFUSÉE' },
  REVOKED: { tone: 'bad', title: 'TICKET RÉVOQUÉ', sub: 'Ce ticket a été désactivé par l’administration. ENTRÉE REFUSÉE' },
  EXPIRED: { tone: 'bad', title: 'TICKET EXPIRÉ', sub: 'Ce ticket n’est plus valable. ENTRÉE REFUSÉE' },
  EVENT_INACTIVE: { tone: 'bad', title: 'ÉVÉNEMENT NON ACTIF', sub: 'Les entrées sont fermées pour cet événement. ENTRÉE REFUSÉE' },
};

const BG: Record<Tone, string> = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad' };

function Icon({ tone }: { tone: Tone }) {
  const path =
    tone === 'ok' ? 'M5 13l4 4L19 7' : tone === 'warn' ? 'M12 7v6m0 4h.01' : 'M6 6l12 12M18 6L6 18';
  return (
    <svg viewBox="0 0 24 24" className="h-20 w-20 animate-pop" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

export default function ScanResultPanel({
  response,
  onNext,
  onConfirmEntry,
}: {
  response: ScanResponse;
  onNext: () => void;
  /** Fourni quand le ticket vient d'être vérifié en mode CHECK : permet de consommer l'entrée explicitement. */
  onConfirmEntry?: () => void;
}) {
  const cfg = CONFIG[response.result];
  const checkOnly = response.mode === ('CHECK' satisfies ScanMode) && response.result === 'VALID';
  const t = response.ticket;

  const lines: [string, string][] = [];
  if (t) {
    lines.push(['Nom', t.participant_name], ['Ticket', t.ticket_code]);
    if (response.result === 'ALREADY_USED') {
      lines.push(
        ['Date', formatDate(t.validated_at)],
        ['Heure', formatTime(t.validated_at)],
        ['Point de contrôle', t.validation_location ?? '—'],
      );
    } else if (response.result === 'VALID') {
      lines.push(['Statut', checkOnly ? 'VALIDE (non consommé)' : 'VALIDE'], ['Émis le', formatDate(t.issued_at)]);
    } else {
      lines.push(['Statut', t.status]);
    }
  }

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label={cfg.title}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center text-bg ${BG[cfg.tone]}`}
    >
      <Icon tone={cfg.tone} />
      <h2 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">{cfg.title}</h2>
      <p className="mt-2 max-w-sm text-lg font-semibold">
        {checkOnly ? 'Valide — entrée pas encore enregistrée' : cfg.sub}
      </p>

      {lines.length > 0 && (
        <dl className="mt-6 w-full max-w-sm space-y-1.5 rounded-2xl bg-black/20 p-4 text-left text-ink">
          {lines.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-sm opacity-80">{k}</dt>
              <dd className="text-right font-bold">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-8 flex w-full max-w-sm flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
        {checkOnly && onConfirmEntry && (
          <button type="button" onClick={onConfirmEntry} className="rounded-2xl bg-bg px-6 py-4 text-lg font-black text-ink">
            VALIDER L’ENTRÉE
          </button>
        )}
        <button type="button" onClick={onNext} className="rounded-2xl bg-black/25 px-6 py-4 text-lg font-bold text-ink">
          Scanner le suivant
        </button>
      </div>
    </div>
  );
}
