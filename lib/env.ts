import { z } from 'zod';

/**
 * Variables PUBLIQUES : lisibles côté navigateur.
 * Next.js remplace `process.env.NEXT_PUBLIC_*` statiquement, d'où l'accès explicite.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  NEXT_PUBLIC_TIMEZONE: z.string().default('Africa/Libreville'),
});

export function publicEnv() {
  return publicSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_TIMEZONE: process.env.NEXT_PUBLIC_TIMEZONE,
  });
}

/** Variables SECRÈTES : à n'appeler que dans du code serveur (fichiers important `server-only`). */
const secretSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  AUDIT_HASH_SALT: z.string().min(16, 'AUDIT_HASH_SALT doit faire au moins 16 caractères'),
  DEFAULT_EVENT_SLUG: z.string().min(1).default('nuit-sans-fin'),
});

export function secretEnv() {
  return secretSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    AUDIT_HASH_SALT: process.env.AUDIT_HASH_SALT,
    DEFAULT_EVENT_SLUG: process.env.DEFAULT_EVENT_SLUG,
  });
}
