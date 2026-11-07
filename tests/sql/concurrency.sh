#!/usr/bin/env bash
# Test 8 : N scans SIMULTANÉS du même ticket → exactement UNE validation acceptée.
# Usage : PSQL="psql -h /chemin/socket -p 54329 -U postgres -d chill" tests/sql/concurrency.sh [N]
set -euo pipefail
N="${1:-30}"
PSQL="${PSQL:?définir PSQL, ex. PSQL='psql -h localhost -U postgres -d chill'}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

$PSQL -qAt <<'SQL'
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000f2', 'conc@test'),
  ('00000000-0000-0000-0000-0000000000f3', 'concadm@test') on conflict do nothing;
insert into public.profiles (id, email, role) values
  ('00000000-0000-0000-0000-0000000000f2', 'conc@test', 'SCANNER'),
  ('00000000-0000-0000-0000-0000000000f3', 'concadm@test', 'ADMIN') on conflict do nothing;
insert into public.events (id, slug, name) values ('00000000-0000-0000-0000-0000000000f1', 'conc', 'CONC') on conflict do nothing;
SQL

# Ticket frais pour ce test
$PSQL -qAt -c "select public.issue_ticket(gen_random_uuid(), '00000000-0000-0000-0000-0000000000f1', 'Course Critique', 'NSF-6666-7777', encode(digest('race-token','sha256'),'hex'), now(), null, '00000000-0000-0000-0000-0000000000f3', null, null)" >/dev/null

for i in $(seq 1 "$N"); do
  $PSQL -qAt -c "select public.verify_ticket(encode(digest('race-token','sha256'),'hex'), null, 'ENTRY', '00000000-0000-0000-0000-0000000000f2', 'Entrée $i', 'ip', 's')->>'result'" > "$TMP/$i.out" &
done
wait

VALID=$(cat "$TMP"/*.out | grep -c '^VALID$' || true)
USED=$(cat "$TMP"/*.out | grep -c '^ALREADY_USED$' || true)
echo "Scans simultanés : $N → VALID=$VALID · ALREADY_USED=$USED"
if [ "$VALID" -ne 1 ] || [ "$((VALID + USED))" -ne "$N" ]; then
  echo "ÉCHEC : exactement une validation attendue" >&2
  exit 1
fi
echo "PASS  T8 un seul scan accepté sur $N tentatives simultanées"
