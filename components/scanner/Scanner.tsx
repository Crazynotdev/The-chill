'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { BrowserQRCodeReader, type IScannerControls } from '@zxing/browser';
import ScanResultPanel from './ScanResultPanel';
import type { ScanMode, ScanResponse } from '@/types';

const CHECKPOINTS = ['Entrée principale', 'Entrée VIP', 'Accès secondaire'];

function vibrate(result: ScanResponse['result']) {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  navigator.vibrate(result === 'VALID' ? 80 : [120, 60, 120]);
}

export default function Scanner({ initialToken }: { initialToken: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const busyRef = useRef(false);
  const lastInputRef = useRef<string | null>(null);

  const [mode, setMode] = useState<ScanMode>('ENTRY');
  const [checkpoint, setCheckpoint] = useState(CHECKPOINTS[0]!);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState('');

  // Refs miroir : le callback de la caméra est créé une seule fois et doit voir les valeurs courantes.
  const modeRef = useRef(mode);
  const checkpointRef = useRef(checkpoint);
  modeRef.current = mode;
  checkpointRef.current = checkpoint;

  const submit = useCallback(async (input: string, forcedMode?: ScanMode) => {
    if (busyRef.current) return;
    busyRef.current = true;
    lastInputRef.current = input;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, mode: forcedMode ?? modeRef.current, checkpoint: checkpointRef.current }),
      });
      if (res.status === 401) {
        window.location.href = '/login?next=/scan';
        return;
      }
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Vérification impossible');
      const data = body as ScanResponse;
      vibrate(data.result);
      setResponse(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur réseau — réessayez');
      busyRef.current = false;
    } finally {
      setLoading(false);
    }
  }, []);

  const next = useCallback(() => {
    setResponse(null);
    setError(null);
    lastInputRef.current = null;
    busyRef.current = false;
  }, []);

  const stopCamera = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraOn(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Caméra indisponible (HTTPS requis). Utilisez la saisie manuelle.');
      return;
    }
    try {
      const reader = new BrowserQRCodeReader(undefined, { delayBetweenScanAttempts: 120 });
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } }, audio: false },
        videoRef.current!,
        (result) => {
          if (result && !busyRef.current) void submit(result.getText());
        },
      );
      setCameraOn(true);
    } catch {
      setCameraError('Accès à la caméra refusé ou impossible. Utilisez la saisie manuelle.');
    }
  }, [submit]);

  // Arrivée depuis l'URL du QR scanné avec l'appareil photo natif : vérification SANS consommer le ticket.
  useEffect(() => {
    if (initialToken) {
      window.history.replaceState(null, '', '/scan'); // ne laisse pas le token dans l'historique
      void submit(initialToken, 'CHECK');
    }
  }, [initialToken, submit]);

  useEffect(() => () => controlsRef.current?.stop(), []);

  // Un résultat valide s'efface seul pour garder le rythme à l'entrée (les refus restent affichés).
  useEffect(() => {
    if (response?.result === 'VALID' && response.mode === 'ENTRY') {
      const id = setTimeout(next, 3500);
      return () => clearTimeout(id);
    }
  }, [response, next]);

  function onManual(e: FormEvent) {
    e.preventDefault();
    if (manual.trim().length >= 6) {
      void submit(manual.trim());
      setManual('');
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-line p-1" role="group" aria-label="Mode de scan">
        {(
          [
            ['ENTRY', 'Entrée'],
            ['CHECK', 'Vérif. seule'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={`rounded-lg py-2.5 text-sm font-semibold transition ${
              mode === value ? 'bg-white/10 text-ink' : 'text-mute'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-line bg-black">
        <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
        {cameraOn && (
          <div className="pointer-events-none absolute inset-8 rounded-3xl border-2 border-accent2/70 shadow-[0_0_0_999px_rgba(0,0,0,.35)]" />
        )}
        {!cameraOn && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-mute">La caméra est désactivée.</p>
            <button type="button" className="btn-primary" onClick={startCamera}>
              Activer la caméra
            </button>
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-sm font-semibold">
            Vérification…
          </div>
        )}
      </div>

      {cameraOn && (
        <button type="button" className="btn-ghost mt-3 w-full" onClick={stopCamera}>
          Arrêter la caméra
        </button>
      )}
      {cameraError && (
        <p role="alert" className="mt-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
          {cameraError}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <div className="card mt-4 space-y-4">
        <div>
          <label htmlFor="checkpoint" className="label">
            Point de contrôle
          </label>
          <select id="checkpoint" className="input" value={checkpoint} onChange={(e) => setCheckpoint(e.target.value)}>
            {CHECKPOINTS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <form onSubmit={onManual}>
          <label htmlFor="manual" className="label">
            Saisie manuelle du code
          </label>
          <div className="flex gap-2">
            <input
              id="manual"
              className="input font-mono uppercase"
              placeholder="NSF-XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              value={manual}
              onChange={(e) => setManual(e.target.value)}
            />
            <button type="submit" className="btn-primary" disabled={loading || manual.trim().length < 6}>
              Vérifier
            </button>
          </div>
        </form>
      </div>

      {response && (
        <ScanResultPanel
          response={response}
          onNext={next}
          onConfirmEntry={
            response.mode === 'CHECK' && response.ticket && lastInputRef.current
              ? () => {
                  const input = lastInputRef.current!;
                  next();
                  void submit(input, 'ENTRY');
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
