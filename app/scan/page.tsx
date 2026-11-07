import type { Metadata } from 'next';
import AppShell from '@/components/layout/AppShell';
import Scanner from '@/components/scanner/Scanner';
import { requirePageActor } from '@/lib/security/auth';
import { TOKEN_REGEX } from '@/lib/security/tokens';

export const metadata: Metadata = { title: 'Scanner' };
export const dynamic = 'force-dynamic';

export default async function ScanPage({ searchParams }: { searchParams: { t?: string } }) {
  const actor = await requirePageActor(['SUPER_ADMIN', 'ADMIN', 'SCANNER']);
  const initialToken = searchParams.t && TOKEN_REGEX.test(searchParams.t) ? searchParams.t : null;

  return (
    <AppShell actor={actor} active="/scan">
      <Scanner initialToken={initialToken} />
    </AppShell>
  );
}
