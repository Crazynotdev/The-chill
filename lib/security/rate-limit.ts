import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { ApiError } from '@/lib/security/http';

/**
 * Limitation de débit partagée entre toutes les instances serverless : le compteur vit dans Postgres
 * (fonction check_rate_limit, upsert atomique), pas en mémoire de processus.
 * En cas d'indisponibilité de la base on REFUSE (fail closed) : mieux vaut bloquer que laisser brute-forcer.
 */
export async function enforceRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const { data, error } = await createSupabaseAdmin().rpc('check_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new ApiError(503, 'RATE_LIMIT_UNAVAILABLE', 'Service momentanément indisponible');
  if (data !== true) throw new ApiError(429, 'RATE_LIMITED', 'Trop de requêtes, réessayez dans un instant');
}
