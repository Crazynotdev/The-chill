import 'server-only';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '@/lib/supabase/server';
import { ApiError, hashedIp } from '@/lib/security/http';
import type { Role } from '@/types';

export interface Actor {
  id: string;
  email: string | null;
  fullName: string | null;
  role: Role;
  sessionId: string | null;
}

function sessionIdFromJwt(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'));
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch {
    return null;
  }
}

/**
 * Identité de l'appelant, établie CÔTÉ SERVEUR :
 *  1. getUser() valide le JWT auprès de Supabase Auth ;
 *  2. le rôle vient de la table `profiles` (lue via RLS), jamais d'un champ envoyé par le client ;
 *  3. un compte sans profil, ou désactivé, n'a aucun accès.
 */
export async function getActor(): Promise<Actor | null> {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active, full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || !profile.is_active) return null;

  // Utilisé uniquement comme identifiant de session dans l'audit (pas pour décider d'un accès).
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile.full_name ?? null,
    role: profile.role as Role,
    sessionId: sessionIdFromJwt(session?.access_token),
  };
}

/** Pour les routes API : lève 401 / 403. */
export async function requireActor(roles: Role[]): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentification requise');
  if (!roles.includes(actor.role)) throw new ApiError(403, 'FORBIDDEN', 'Permissions insuffisantes');
  return actor;
}

/** Pour les pages serveur : redirige au lieu de lever. Les SCANNER sont renvoyés vers /scan. */
export async function requirePageActor(roles: Role[]): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect('/login');
  if (!roles.includes(actor.role)) redirect(actor.role === 'SCANNER' ? '/scan' : '/dashboard');
  return actor;
}

export { hashedIp };
