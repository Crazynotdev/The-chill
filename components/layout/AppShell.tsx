import Link from 'next/link';
import type { Actor } from '@/lib/security/auth';
import SignOutButton from './SignOutButton';

const NAV = [
  { href: '/dashboard', label: 'Tableau de bord', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/tickets', label: 'Tickets', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/scan', label: 'Scanner', roles: ['SUPER_ADMIN', 'ADMIN', 'SCANNER'] },
  { href: '/audit', label: 'Audit', roles: ['SUPER_ADMIN', 'ADMIN'] },
  { href: '/settings', label: 'Paramètres', roles: ['SUPER_ADMIN', 'ADMIN'] },
] as const;

const ROLE_LABEL = { SUPER_ADMIN: 'Super admin', ADMIN: 'Admin', SCANNER: 'Scanner' } as const;

export default function AppShell({
  actor,
  active,
  children,
}: {
  actor: Actor;
  active: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-6xl px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <Link href="/" className="text-lg font-black tracking-tight">
          NUIT <span className="text-accent2">SANS FIN</span>
        </Link>
        <nav className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto" aria-label="Navigation">
          {NAV.filter((n) => (n.roles as readonly string[]).includes(actor.role)).map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active === n.href ? 'page' : undefined}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                active === n.href ? 'bg-white/10 text-ink' : 'text-mute hover:text-ink'
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden text-right text-xs leading-tight text-mute sm:block">
            {actor.fullName ?? actor.email}
            <br />
            <span className="text-accent2">{ROLE_LABEL[actor.role]}</span>
          </span>
          <SignOutButton />
        </div>
      </header>
      {children}
    </div>
  );
}
