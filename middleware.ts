import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

const PROTECTED = ['/dashboard', '/tickets', '/scan', '/settings', '/audit', '/verify'];

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(list: CookieToSet[]) {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getUser() valide le JWT auprès de Supabase Auth (contrairement à getSession()).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', pathname + search);
    return NextResponse.redirect(url);
  }
  // /login n'est volontairement pas redirigé ici : un compte authentifié SANS profil actif n'a aucun accès,
  // et la page /login (côté serveur) décide elle-même, ce qui évite toute boucle de redirection.
  return response;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)'],
};
