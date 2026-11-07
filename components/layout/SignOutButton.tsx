'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase/client';

export default function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn-ghost !px-3 !py-1.5 text-xs"
      onClick={async () => {
        await createSupabaseBrowser().auth.signOut();
        router.replace('/login');
        router.refresh();
      }}
    >
      Déconnexion
    </button>
  );
}
