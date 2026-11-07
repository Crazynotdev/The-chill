import { Suspense } from 'react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getActor } from '@/lib/security/auth';
import LoginForm from './LoginForm';

export const metadata: Metadata = { title: 'Connexion' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  // Déjà connecté avec un profil actif → direction l'application.
  if (await getActor()) redirect('/dashboard');

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent2">Espace organisation</p>
        <h1 className="mt-2 text-4xl font-black tracking-tight">NUIT SANS FIN</h1>
        <p className="mt-2 text-sm text-mute">Billetterie & contrôle d’accès</p>
      </div>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
