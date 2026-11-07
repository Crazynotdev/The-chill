import { redirect } from 'next/navigation';
import { requirePageActor } from '@/lib/security/auth';
import { TOKEN_REGEX } from '@/lib/security/tokens';

export const dynamic = 'force-dynamic';

/**
 * Cible de l'URL encodée dans le QR. Réservée au personnel (le middleware renvoie vers /login sinon) :
 * une personne qui scanne le QR avec son appareil photo n'apprend rien sur le ticket.
 * Le personnel connecté est envoyé vers /scan, où le token est vérifié en mode CHECK (sans consommer le ticket).
 */
export default async function VerifyPage({ params }: { params: { token: string } }) {
  await requirePageActor(['SUPER_ADMIN', 'ADMIN', 'SCANNER']);
  if (!TOKEN_REGEX.test(params.token)) redirect('/scan');
  redirect(`/scan?t=${encodeURIComponent(params.token)}`);
}
