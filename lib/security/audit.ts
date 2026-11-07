import 'server-only';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { Actor } from '@/lib/security/auth';

/** Écrit une entrée d'audit immuable (qui, quoi, quand, quel objet, quelle session). */
export async function writeAudit(
  actor: Actor,
  ipHash: string,
  action: string,
  entityType: string | null,
  entityId: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await createSupabaseAdmin().rpc('write_audit', {
    p_actor: actor.id,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_session: actor.sessionId,
    p_ip_hash: ipHash,
    p_metadata: metadata,
  });
  if (error) console.error('[audit] écriture impossible', error.message);
}
