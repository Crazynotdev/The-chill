import 'server-only';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { secretEnv } from '@/lib/env';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Réponse d'erreur uniforme ; les erreurs inattendues ne divulguent aucun détail interne. */
export function jsonError(e: unknown): NextResponse {
  if (e instanceof ApiError) {
    return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status });
  }
  if (e instanceof ZodError) {
    const message = e.issues[0]?.message ?? 'Requête invalide';
    return NextResponse.json({ error: { code: 'VALIDATION_ERROR', message } }, { status: 400 });
  }
  console.error('[api] unexpected error', e);
  return NextResponse.json({ error: { code: 'INTERNAL', message: 'Erreur interne' } }, { status: 500 });
}

/**
 * Défense CSRF pour les requêtes qui modifient l'état (l'auth repose sur des cookies) :
 *  - Content-Type JSON obligatoire (impossible depuis un <form> cross-site sans preflight CORS) ;
 *  - en-tête Origin, s'il est présent, doit correspondre à l'hôte de la requête.
 */
export function assertSafeMutation(request: Request): void {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('application/json')) {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type application/json requis');
  }
  const origin = request.headers.get('origin');
  if (origin) {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      /* origine illisible → refus ci-dessous */
    }
    if (!host || originHost !== host) throw new ApiError(403, 'BAD_ORIGIN', 'Origine non autorisée');
  }
}

export async function readJson(request: Request, maxBytes = 4096): Promise<unknown> {
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Requête trop volumineuse');
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError(400, 'BAD_JSON', 'JSON invalide');
  }
}

/** IP hachée + salée : suffisante pour corréler des abus, sans conserver l'adresse en clair. */
export function hashedIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = fwd || request.headers.get('x-real-ip') || 'unknown';
  return createHash('sha256').update(`${secretEnv().AUDIT_HASH_SALT}:${ip}`).digest('hex').slice(0, 32);
}
