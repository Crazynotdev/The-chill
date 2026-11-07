-- ════════════════════════════════════════════════════════════════════════════
-- NUIT SANS FIN — schéma initial
-- Principes :
--   • RLS activée partout ; le navigateur n'a que des droits de LECTURE, par rôle.
--   • Toute écriture passe par des fonctions SECURITY DEFINER appelées par le serveur
--     (clé service_role). Aucune écriture directe depuis le client.
--   • Le token de validation n'est JAMAIS stocké en clair : seul son SHA-256 l'est.
--   • La validation d'entrée est un UPDATE conditionnel unique (atomique).
-- ════════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists pg_trgm with schema extensions;

-- ── Types ──────────────────────────────────────────────────────────────────
create type public.user_role as enum ('SUPER_ADMIN', 'ADMIN', 'SCANNER');
create type public.ticket_status as enum ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED');

-- ── Utilitaires ────────────────────────────────────────────────────────────
create or replace function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.prevent_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'Les journaux sont immuables (% sur %)', tg_op, tg_table_name using errcode = '42501';
end $$;

-- ── Événements ─────────────────────────────────────────────────────────────
create table public.events (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name              text not null,
  venue             text,
  starts_at         timestamptz,
  ends_at           timestamptz,
  ticket_expires_at timestamptz,            -- au-delà, les tickets ACTIVE sont refusés (EXPIRED)
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- ── Profils du personnel (liés à Supabase Auth) ────────────────────────────
-- Pas de trigger d'auto-création : un compte Auth sans profil n'a AUCUN accès.
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  role       public.user_role not null default 'SCANNER',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Tickets ────────────────────────────────────────────────────────────────
create table public.tickets (
  id                  uuid primary key,
  event_id            uuid not null references public.events(id),
  ticket_code         text not null unique
                        check (ticket_code ~ '^NSF-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$'),
  token_hash          text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  participant_name    text not null check (char_length(participant_name) between 2 and 80),
  status              public.ticket_status not null default 'ACTIVE',
  issued_at           timestamptz not null default now(),
  issued_by           uuid references public.profiles(id) on delete set null,
  validated_at        timestamptz,
  validated_by        uuid references public.profiles(id) on delete set null,
  validation_location text,
  revoked_at          timestamptz,
  revoked_by          uuid references public.profiles(id) on delete set null,
  revoke_reason       text check (char_length(revoke_reason) <= 200),
  pdf_path            text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index tickets_event_idx     on public.tickets (event_id);
create index tickets_status_idx    on public.tickets (status);
create index tickets_created_idx   on public.tickets (created_at desc);
create index tickets_name_trgm_idx on public.tickets using gin (participant_name extensions.gin_trgm_ops);
create trigger tickets_updated_at before update on public.tickets
  for each row execute function public.set_updated_at();

-- ── Journal des scans (toutes les tentatives, valides ou non) ──────────────
create table public.scan_logs (
  id                bigint generated always as identity primary key,
  ticket_id         uuid references public.tickets(id),
  event_id          uuid references public.events(id),
  scanned_by        uuid,                     -- pas de FK : l'historique survit à la suppression d'un compte
  result            text not null check (result in ('VALID','ALREADY_USED','INVALID','REVOKED','EXPIRED','EVENT_INACTIVE')),
  mode              text not null check (mode in ('ENTRY','CHECK')),
  checkpoint        text,
  input_fingerprint text,                     -- préfixe d'un md5 : permet de corréler sans stocker le token
  ip_hash           text,
  created_at        timestamptz not null default now()
);
create index scan_logs_ticket_idx  on public.scan_logs (ticket_id, created_at desc);
create index scan_logs_invalid_idx on public.scan_logs (scanned_by, created_at desc) where result = 'INVALID';
create trigger scan_logs_immutable before update or delete on public.scan_logs
  for each row execute function public.prevent_mutation();

-- ── Journal d'audit (qui / quoi / quand / quel ticket / quelle session) ────
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  actor_role  public.user_role,
  action      text not null,
  entity_type text,
  entity_id   text,
  session_id  text,
  ip_hash     text,                           -- IP hachée + salée côté serveur, jamais en clair
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx  on public.audit_logs (entity_type, entity_id, created_at desc);
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function public.prevent_mutation();

-- ── Limitation de débit (fenêtre fixe, atomique) ───────────────────────────
create table public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         integer not null default 0
);

-- ════════════════════════════════════════════════════════════════════════════
-- Fonctions métier (SECURITY DEFINER, exécutables par service_role uniquement)
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public._actor_role(p_actor uuid) returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = p_actor and is_active
$$;

create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hits integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_limit;
end $$;

-- Émission : insertion du ticket + audit dans UNE transaction.
-- Les contraintes UNIQUE (id, ticket_code, token_hash) garantissent l'absence de collision,
-- même avec plusieurs administrateurs en parallèle (le serveur réessaie sur 23505).
create or replace function public.issue_ticket(
  p_id uuid, p_event_id uuid, p_name text, p_code text, p_token_hash text,
  p_issued_at timestamptz, p_pdf_path text, p_actor uuid, p_session text, p_ip_hash text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role;
  v_ev   public.events%rowtype;
  t      public.tickets%rowtype;
begin
  v_role := public._actor_role(p_actor);
  if coalesce(v_role::text, '') not in ('SUPER_ADMIN', 'ADMIN') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_ev from public.events where id = p_event_id;
  if not found or not v_ev.is_active then
    raise exception 'EVENT_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  insert into public.tickets (id, event_id, ticket_code, token_hash, participant_name, issued_at, issued_by, pdf_path)
  values (p_id, p_event_id, p_code, p_token_hash, p_name, p_issued_at, p_actor, p_pdf_path)
  returning * into t;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, session_id, ip_hash, metadata)
  values (p_actor, v_role, 'TICKET_CREATED', 'ticket', t.id::text, p_session, p_ip_hash,
          jsonb_build_object('ticket_code', t.ticket_code, 'event_id', p_event_id));

  return to_jsonb(t) - 'token_hash';
end $$;

-- Validation d'un ticket.
--   ENTRY : consomme le ticket (ACTIVE → USED) via UN UPDATE conditionnel.
--           Sous READ COMMITTED, deux scans simultanés se sérialisent sur la ligne :
--           le second réévalue `status = 'ACTIVE'` après le commit du premier → 0 ligne → ALREADY_USED.
--   CHECK : lecture seule, ne consomme rien.
create or replace function public.verify_ticket(
  p_token_hash text, p_code text, p_mode text, p_actor uuid,
  p_checkpoint text, p_ip_hash text, p_session text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role   public.user_role;
  t        public.tickets%rowtype;
  t2       public.tickets%rowtype;
  ev       public.events%rowtype;
  v_found  boolean := false;
  v_result text;
  v_action text;
begin
  v_role := public._actor_role(p_actor);
  if v_role is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_mode not in ('ENTRY', 'CHECK') then
    raise exception 'BAD_MODE' using errcode = '22023';
  end if;

  if p_token_hash is not null then
    select * into t from public.tickets where token_hash = p_token_hash;
    v_found := found;
  elsif p_code is not null then
    select * into t from public.tickets where ticket_code = p_code;
    v_found := found;
  end if;

  if not v_found then
    v_result := 'INVALID';
  else
    select * into ev from public.events where id = t.event_id;

    if p_mode = 'ENTRY'
       and t.status = 'ACTIVE'
       and ev.is_active
       and (ev.ticket_expires_at is null or now() <= ev.ticket_expires_at) then
      update public.tickets
         set status = 'USED', validated_at = now(), validated_by = p_actor, validation_location = p_checkpoint
       where id = t.id and status = 'ACTIVE'
      returning * into t2;
      if found then
        t := t2;
        v_result := 'VALID';
      else
        -- Course perdue : un autre scan a consommé le ticket entre-temps.
        select * into t from public.tickets where id = t.id;
      end if;
    end if;

    if v_result is null then
      v_result := case
        when t.status = 'REVOKED' then 'REVOKED'
        when t.status = 'EXPIRED' then 'EXPIRED'
        when not ev.is_active then 'EVENT_INACTIVE'
        when t.status = 'USED' then 'ALREADY_USED'
        when ev.ticket_expires_at is not null and now() > ev.ticket_expires_at then 'EXPIRED'
        else 'VALID'            -- uniquement possible en mode CHECK sur un ticket ACTIVE
      end;
    end if;
  end if;

  insert into public.scan_logs (ticket_id, event_id, scanned_by, result, mode, checkpoint, input_fingerprint, ip_hash)
  values (case when v_found then t.id end, case when v_found then t.event_id end, p_actor, v_result, p_mode,
          p_checkpoint, left(md5(coalesce(p_token_hash, p_code, '')), 8), p_ip_hash);

  v_action := case
    when v_result = 'VALID' and p_mode = 'ENTRY' then 'TICKET_VALIDATED'
    when v_result = 'VALID'                      then 'TICKET_CHECKED'
    else 'TICKET_SCAN_REJECTED'
  end;
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, session_id, ip_hash, metadata)
  values (p_actor, v_role, v_action, case when v_found then 'ticket' end, case when v_found then t.id::text end,
          p_session, p_ip_hash, jsonb_build_object('result', v_result, 'mode', p_mode, 'checkpoint', p_checkpoint));

  return jsonb_build_object(
    'result', v_result,
    'mode', p_mode,
    'ticket', case when v_found then jsonb_build_object(
        'ticket_code', t.ticket_code,
        'participant_name', t.participant_name,
        'status', t.status,
        'issued_at', t.issued_at,
        'validated_at', t.validated_at,
        'validation_location', t.validation_location,
        'event_name', ev.name) end
  );
end $$;

-- Révocation / réactivation. REVOKE : ADMIN+. REACTIVATE : SUPER_ADMIN uniquement.
create or replace function public.set_ticket_status(
  p_ticket_id uuid, p_action text, p_reason text, p_actor uuid, p_session text, p_ip_hash text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_role public.user_role;
  t      public.tickets%rowtype;
  t2     public.tickets%rowtype;
begin
  v_role := public._actor_role(p_actor);
  if p_action = 'REVOKE' and coalesce(v_role::text, '') not in ('SUPER_ADMIN', 'ADMIN') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  elsif p_action = 'REACTIVATE' and coalesce(v_role::text, '') <> 'SUPER_ADMIN' then
    raise exception 'FORBIDDEN' using errcode = '42501';
  elsif p_action not in ('REVOKE', 'REACTIVATE') then
    raise exception 'BAD_ACTION' using errcode = '22023';
  end if;

  select * into t from public.tickets where id = p_ticket_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if p_action = 'REVOKE' then
    if t.status = 'REVOKED' then
      raise exception 'ALREADY_REVOKED' using errcode = 'P0001';
    end if;
    update public.tickets
       set status = 'REVOKED', revoked_at = now(), revoked_by = p_actor, revoke_reason = nullif(p_reason, '')
     where id = t.id returning * into t2;
  else
    if t.status <> 'REVOKED' then
      raise exception 'NOT_REVOKED' using errcode = 'P0001';
    end if;
    update public.tickets
       set status = (case when t.validated_at is null then 'ACTIVE' else 'USED' end)::public.ticket_status,
           revoked_at = null, revoked_by = null, revoke_reason = null
     where id = t.id returning * into t2;
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, session_id, ip_hash, metadata)
  values (p_actor, v_role,
          case when p_action = 'REVOKE' then 'TICKET_REVOKED' else 'TICKET_REACTIVATED' end,
          'ticket', t.id::text, p_session, p_ip_hash,
          jsonb_build_object('ticket_code', t.ticket_code, 'reason', nullif(p_reason, '')));

  return to_jsonb(t2) - 'token_hash';
end $$;

-- Journal générique (connexion, téléchargement PDF, verrouillage anti-brute-force…).
create or replace function public.write_audit(
  p_actor uuid, p_action text, p_entity_type text, p_entity_id text,
  p_session text, p_ip_hash text, p_metadata jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, session_id, ip_hash, metadata)
  values (p_actor, public._actor_role(p_actor), p_action, p_entity_type, p_entity_id, p_session, p_ip_hash,
          coalesce(p_metadata, '{}'::jsonb));
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- Droits
-- ════════════════════════════════════════════════════════════════════════════
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant select on public.events, public.profiles, public.tickets, public.scan_logs, public.audit_logs to authenticated;

grant execute on function
  public._actor_role(uuid),
  public.check_rate_limit(text, integer, integer),
  public.issue_ticket(uuid, uuid, text, text, text, timestamptz, text, uuid, text, text),
  public.verify_ticket(text, text, text, uuid, text, text, text),
  public.set_ticket_status(uuid, text, text, uuid, text, text),
  public.write_audit(uuid, text, text, text, text, text, jsonb)
to service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- Row Level Security (lecture seule côté navigateur, filtrée par rôle)
-- ════════════════════════════════════════════════════════════════════════════
create or replace function public.auth_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;
revoke all on function public.auth_role() from public, anon;
grant execute on function public.auth_role() to authenticated, service_role;

alter table public.events     enable row level security;
alter table public.profiles   enable row level security;
alter table public.tickets    enable row level security;
alter table public.scan_logs  enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limits enable row level security;   -- aucune policy : service_role uniquement

create policy events_read_staff on public.events
  for select to authenticated using (public.auth_role() is not null);

create policy profiles_read_self_or_admin on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.auth_role() in ('SUPER_ADMIN', 'ADMIN'));

create policy tickets_read_admin on public.tickets
  for select to authenticated using (public.auth_role() in ('SUPER_ADMIN', 'ADMIN'));

create policy scan_logs_read_admin on public.scan_logs
  for select to authenticated using (public.auth_role() in ('SUPER_ADMIN', 'ADMIN'));

create policy audit_logs_read_admin on public.audit_logs
  for select to authenticated using (public.auth_role() in ('SUPER_ADMIN', 'ADMIN'));

-- Aucune policy INSERT/UPDATE/DELETE : toute écriture depuis le navigateur est refusée.

-- ════════════════════════════════════════════════════════════════════════════
-- Storage : bucket PDF privé, sans aucune policy (accès service_role uniquement)
-- ════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tickets-pdf', 'tickets-pdf', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;
