-- Tests SQL de la logique critique (émission, validation, révocation, RLS, rate limit, immutabilité).
-- Exécution : voir tests/sql/run.sh. Chaque test lève une exception en cas d'échec.
\set ON_ERROR_STOP on
\set QUIET on

create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin
  if cond is not true then raise exception 'ÉCHEC : %', msg; end if;
  raise notice 'PASS  %', msg;
end $$;

-- Jeu de données
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a0', 'super@test'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test'),
  ('00000000-0000-0000-0000-0000000000a2', 'scanner@test');
insert into public.profiles (id, email, role) values
  ('00000000-0000-0000-0000-0000000000a0', 'super@test', 'SUPER_ADMIN'),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test', 'ADMIN'),
  ('00000000-0000-0000-0000-0000000000a2', 'scanner@test', 'SCANNER');
insert into public.events (id, slug, name) values ('00000000-0000-0000-0000-0000000000e1', 'test-event', 'THE CHILL (test)');

-- Helpers : hash d'un token de test
create function pg_temp.h(t text) returns text language sql as $$ select encode(digest(t, 'sha256'), 'hex') $$;

-- Test 1 : création d'un ticket (ADMIN) ───────────────────────────────────────
do $$
declare r jsonb;
begin
  r := public.issue_ticket('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000e1',
        'Jean Dupont', 'NSF-7X92-KP4M', pg_temp.h('token-1'), now(), 'e1/b1.pdf',
        '00000000-0000-0000-0000-0000000000a1', 'sess-1', 'iphash');
  perform pg_temp.ok(r->>'status' = 'ACTIVE', 'T1 création → ticket ACTIVE');
  perform pg_temp.ok(not (r ? 'token_hash'), 'T1 le token_hash n''est jamais renvoyé');
  perform pg_temp.ok((select count(*) from public.audit_logs where action = 'TICKET_CREATED') = 1, 'T1 audit TICKET_CREATED écrit');
end $$;

-- Test 1b : un SCANNER ne peut pas créer ; code dupliqué rejeté ───────────────
do $$
begin
  begin
    perform public.issue_ticket('00000000-0000-0000-0000-0000000000b9', '00000000-0000-0000-0000-0000000000e1',
      'Intrus', 'NSF-2222-3333', pg_temp.h('token-x'), now(), null,
      '00000000-0000-0000-0000-0000000000a2', null, null);
    raise exception 'un SCANNER a pu créer un ticket';
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'T1b un SCANNER ne peut pas émettre de ticket');
  end;
  begin
    perform public.issue_ticket('00000000-0000-0000-0000-0000000000b8', '00000000-0000-0000-0000-0000000000e1',
      'Doublon', 'NSF-7X92-KP4M', pg_temp.h('token-y'), now(), null,
      '00000000-0000-0000-0000-0000000000a1', null, null);
    raise exception 'code dupliqué accepté';
  exception when unique_violation then
    perform pg_temp.ok(true, 'T1b code ticket dupliqué rejeté (UNIQUE)');
  end;
  begin
    perform public.issue_ticket('00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000e1',
      'Doublon token', 'NSF-4444-5555', pg_temp.h('token-1'), now(), null,
      '00000000-0000-0000-0000-0000000000a1', null, null);
    raise exception 'token dupliqué accepté';
  exception when unique_violation then
    perform pg_temp.ok(true, 'T1b token_hash dupliqué rejeté (UNIQUE)');
  end;
end $$;

-- Tests 2 & 3 : scan valide puis déjà utilisé ─────────────────────────────────
do $$
declare r jsonb;
begin
  r := public.verify_ticket(pg_temp.h('token-1'), null, 'CHECK', '00000000-0000-0000-0000-0000000000a2', 'Entrée', 'iph', 's');
  perform pg_temp.ok(r->>'result' = 'VALID', 'T2a vérification seule → VALID');
  perform pg_temp.ok((select status from public.tickets where id = '00000000-0000-0000-0000-0000000000b1') = 'ACTIVE',
                     'T2a le mode CHECK ne consomme pas le ticket');

  r := public.verify_ticket(pg_temp.h('token-1'), null, 'ENTRY', '00000000-0000-0000-0000-0000000000a2', 'Entrée principale', 'iph', 's');
  perform pg_temp.ok(r->>'result' = 'VALID' and r->'ticket'->>'participant_name' = 'Jean Dupont', 'T2b scan ENTRY → VALID');
  perform pg_temp.ok((select status from public.tickets where id = '00000000-0000-0000-0000-0000000000b1') = 'USED', 'T2b ticket passé en USED');

  r := public.verify_ticket(pg_temp.h('token-1'), null, 'ENTRY', '00000000-0000-0000-0000-0000000000a2', 'Entrée principale', 'iph', 's');
  perform pg_temp.ok(r->>'result' = 'ALREADY_USED', 'T3 deuxième scan → ALREADY_USED');
  perform pg_temp.ok(r->'ticket'->>'validation_location' = 'Entrée principale' and r->'ticket'->>'validated_at' is not null,
                     'T3 date et point de contrôle de la 1re validation renvoyés');
end $$;

-- Tests 4 & 5 : token falsifié / faux QR ──────────────────────────────────────
do $$
declare r jsonb;
begin
  r := public.verify_ticket(pg_temp.h('token-1x'), null, 'ENTRY', '00000000-0000-0000-0000-0000000000a2', 'E', 'iph', 's');
  perform pg_temp.ok(r->>'result' = 'INVALID' and r->'ticket' = 'null'::jsonb, 'T4 token modifié → INVALID, aucune donnée divulguée');
  r := public.verify_ticket(pg_temp.h('https://faux.example/verify/AAAA'), null, 'ENTRY', '00000000-0000-0000-0000-0000000000a2', 'E', 'iph', 's');
  perform pg_temp.ok(r->>'result' = 'INVALID', 'T5 faux QR → INVALID');
  r := public.verify_ticket(null, 'NSF-9999-ZZZZ', 'ENTRY', '00000000-0000-0000-0000-0000000000a2', 'E', 'iph', 's');
  perform pg_temp.ok(r->>'result' = 'INVALID', 'T5 faux code manuel → INVALID');
  r := public.verify_ticket(null, 'NSF-7X92-KP4M', 'CHECK', '00000000-0000-0000-0000-0000000000a2', 'E', 'iph', 's');
  perform pg_temp.ok(r->>'result' = 'ALREADY_USED', 'T5b saisie manuelle du bon code → retrouve le ticket');
  perform pg_temp.ok((select count(*) from public.scan_logs where result = 'INVALID') >= 2, 'T5 tentatives invalides journalisées');
end $$;

-- Test 6 : révocation / réactivation / permissions ────────────────────────────
do $$
declare r jsonb;
begin
  begin
    perform public.set_ticket_status('00000000-0000-0000-0000-0000000000b1', 'REVOKE', null, '00000000-0000-0000-0000-0000000000a2', null, null);
    raise exception 'un SCANNER a pu révoquer';
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'T6 un SCANNER ne peut pas révoquer');
  end;

  r := public.set_ticket_status('00000000-0000-0000-0000-0000000000b1', 'REVOKE', 'test', '00000000-0000-0000-0000-0000000000a1', 's', 'i');
  perform pg_temp.ok(r->>'status' = 'REVOKED', 'T6 ADMIN révoque → REVOKED');
  r := public.verify_ticket(pg_temp.h('token-1'), null, 'ENTRY', '00000000-0000-0000-0000-0000000000a2', 'E', 'iph', 's');
  perform pg_temp.ok(r->>'result' = 'REVOKED', 'T6 scan d''un ticket révoqué → REVOKED');

  begin
    perform public.set_ticket_status('00000000-0000-0000-0000-0000000000b1', 'REACTIVATE', null, '00000000-0000-0000-0000-0000000000a1', null, null);
    raise exception 'un ADMIN a pu réactiver';
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'T6 un ADMIN ne peut pas réactiver (SUPER_ADMIN uniquement)');
  end;

  r := public.set_ticket_status('00000000-0000-0000-0000-0000000000b1', 'REACTIVATE', null, '00000000-0000-0000-0000-0000000000a0', 's', 'i');
  perform pg_temp.ok(r->>'status' = 'USED', 'T6 réactivation d''un ticket déjà consommé → retour à USED (pas ré-utilisable)');
end $$;

-- Expiration d'événement + événement inactif ──────────────────────────────────
do $$
declare r jsonb;
begin
  perform public.issue_ticket('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000e1',
    'Marie Curie', 'NSF-8888-9999', pg_temp.h('token-2'), now(), null, '00000000-0000-0000-0000-0000000000a1', null, null);
  update public.events set ticket_expires_at = now() - interval '1 hour';
  r := public.verify_ticket(pg_temp.h('token-2'), null, 'ENTRY', '00000000-0000-0000-0000-0000000000a2', 'E', 'i', 's');
  perform pg_temp.ok(r->>'result' = 'EXPIRED', 'T9 ticket après expiration de l''événement → EXPIRED');
  update public.events set ticket_expires_at = null, is_active = false;
  r := public.verify_ticket(pg_temp.h('token-2'), null, 'ENTRY', '00000000-0000-0000-0000-0000000000a2', 'E', 'i', 's');
  perform pg_temp.ok(r->>'result' = 'EVENT_INACTIVE', 'T9 événement inactif → EVENT_INACTIVE');
  update public.events set is_active = true;
end $$;

-- Compte désactivé : plus aucun accès ─────────────────────────────────────────
do $$
begin
  update public.profiles set is_active = false where id = '00000000-0000-0000-0000-0000000000a2';
  begin
    perform public.verify_ticket(pg_temp.h('token-2'), null, 'ENTRY', '00000000-0000-0000-0000-0000000000a2', 'E', 'i', 's');
    raise exception 'compte désactivé a pu scanner';
  exception when insufficient_privilege then
    perform pg_temp.ok(true, 'T10 un compte désactivé ne peut plus scanner');
  end;
  update public.profiles set is_active = true where id = '00000000-0000-0000-0000-0000000000a2';
end $$;

-- Immutabilité des journaux ───────────────────────────────────────────────────
do $$
begin
  begin
    update public.audit_logs set action = 'X';
    raise exception 'audit modifiable';
  exception when insufficient_privilege then perform pg_temp.ok(true, 'T11 audit_logs : UPDATE interdit'); end;
  begin
    delete from public.scan_logs;
    raise exception 'scan_logs supprimable';
  exception when insufficient_privilege then perform pg_temp.ok(true, 'T11 scan_logs : DELETE interdit'); end;
end $$;

-- Limitation de débit ─────────────────────────────────────────────────────────
do $$
begin
  perform pg_temp.ok(public.check_rate_limit('rl-test', 2, 60) = true, 'T12 rate limit : 1re requête acceptée');
  perform pg_temp.ok(public.check_rate_limit('rl-test', 2, 60) = true, 'T12 rate limit : 2e requête acceptée');
  perform pg_temp.ok(public.check_rate_limit('rl-test', 2, 60) = false, 'T12 rate limit : 3e requête refusée');
end $$;

-- RLS : rôles authenticated ───────────────────────────────────────────────────
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);  -- SCANNER
do $$
begin
  perform pg_temp.ok((select count(*) from public.tickets) = 0, 'T13 RLS : un SCANNER ne lit aucun ticket');
  perform pg_temp.ok((select count(*) from public.audit_logs) = 0, 'T13 RLS : un SCANNER ne lit pas l''audit');
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);  -- ADMIN
do $$
begin
  perform pg_temp.ok((select count(*) from public.tickets) = 2, 'T13 RLS : un ADMIN lit les tickets');
  begin
    insert into public.tickets (id, event_id, ticket_code, token_hash, participant_name)
    values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000e1', 'NSF-3333-4444', repeat('a', 64), 'Direct');
    raise exception 'insertion directe autorisée';
  exception when insufficient_privilege then perform pg_temp.ok(true, 'T13 RLS : INSERT direct depuis le navigateur refusé'); end;
  begin
    perform public.verify_ticket(pg_temp.h('token-2'), null, 'ENTRY', '00000000-0000-0000-0000-0000000000a1', 'E', 'i', 's');
    raise exception 'RPC appelable par authenticated';
  exception when insufficient_privilege then perform pg_temp.ok(true, 'T13 RPC verify_ticket non appelable depuis le navigateur'); end;
end $$;
rollback;

-- Anonyme : aucun accès ───────────────────────────────────────────────────────
begin;
set local role anon;
do $$
begin
  begin
    perform count(*) from public.tickets;
    raise exception 'anon lit tickets';
  exception when insufficient_privilege then perform pg_temp.ok(true, 'T14 anon : aucun accès aux tickets'); end;
end $$;
rollback;

\echo
\echo 'Tous les tests SQL séquentiels sont passés.'
