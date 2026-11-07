import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { secretEnv } from '@/lib/env';

let cached: SupabaseClient | null = null;

/**
 * Client SERVICE ROLE : contourne la RLS.
 * `server-only` fait échouer le build si ce module est importé depuis un composant client.
 * À utiliser uniquement APRÈS un contrôle d'autorisation explicite (requireActor).
 */
export function createSupabaseAdmin(): SupabaseClient {
  if (!cached) {
    cached = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secretEnv().SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
