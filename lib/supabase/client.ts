import { createBrowserClient } from '@supabase/ssr';

/** Client navigateur : clé ANON uniquement, soumis à la RLS. */
export function createSupabaseBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
