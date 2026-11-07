'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

/** N'autorise que des chemins internes (évite les redirections ouvertes). */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard';
}

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError) {
      setError('Identifiants invalides.');
      setLoading(false);
      return;
    }
    // Journalise la connexion (échoue silencieusement si le compte n'a pas de profil actif).
    const res = await fetch('/api/auth/login-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => null);
    if (!res || res.status === 401 || res.status === 403) {
      await supabase.auth.signOut();
      setError('Ce compte n’a pas accès à l’administration.');
      setLoading(false);
      return;
    }
    router.replace(safeNext(params.get('next')));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4 animate-rise" noValidate>
      <div>
        <label htmlFor="email" className="label">
          E-mail
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          className="input"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      <button type="submit" className="btn-primary w-full" disabled={loading || !email || !password}>
        {loading ? 'Connexion…' : 'Se connecter'}
      </button>
    </form>
  );
}
