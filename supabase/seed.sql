-- Événement par défaut (lieu à renseigner plus tard : voir README).
insert into public.events (slug, name, venue, starts_at)
values ('nuit-sans-fin', 'NUIT SANS FIN', null, '2026-12-12 18:00+01')
on conflict (slug) do nothing;

-- ── Créer le premier SUPER_ADMIN ───────────────────────────────────────────
-- 1. Supabase Dashboard → Authentication → Users → "Add user" (email + mot de passe).
-- 2. Désactiver les inscriptions publiques : Authentication → Providers → Email → "Allow new users to sign up" = OFF.
-- 3. Exécuter (en remplaçant l'email) :
--
-- insert into public.profiles (id, email, full_name, role)
-- select id, email, 'Super Admin', 'SUPER_ADMIN' from auth.users where email = 'vous@exemple.com';
