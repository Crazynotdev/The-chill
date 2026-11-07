# NUIT SANS FIN — Plateforme de billetterie

Génération de pass PDF personnalisés, QR uniques, scanner mobile et validation anti-fraude.
**Stack** : Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Auth, Postgres, Storage) · Vercel.

---

## 1. Architecture

```
Navigateur (admin / scanner)
   │  cookies de session Supabase (jamais de service_role)
   ▼
Next.js sur Vercel ── middleware : redirige vers /login ── routes API (runtime Node)
   │   requireActor() : JWT validé par Supabase Auth + rôle lu dans `profiles`
   │   Zod · anti-CSRF · rate limit · audit
   ▼
Supabase Postgres ── fonctions SECURITY DEFINER (issue_ticket, verify_ticket, set_ticket_status)
   │                  RLS : le navigateur n'a qu'un accès LECTURE filtré par rôle
   └─ Storage : bucket privé `tickets-pdf` (aucune policy, accès serveur seulement)
```

Principes clés :

- **Le design du ticket ne prouve rien.** Un ticket est authentique si et seulement si le serveur retrouve son token en base.
- **Le QR ne contient qu'une URL** `https://<domaine>/verify/<token>` : token de 256 bits (CSPRNG). Aucun nom, aucune donnée personnelle.
- **Seul le SHA-256 du token est stocké.** Une fuite de la base ne permet pas de fabriquer un QR valide. Le token n'est jamais renvoyé par l'API ni écrit dans les logs.
- **Toute écriture passe par le serveur** (fonctions SQL appelées avec la clé `service_role`, jamais exposée au navigateur : `server-only` fait échouer le build si on l'importe côté client).
- **Double scan** : la validation est un seul `UPDATE … WHERE status = 'ACTIVE'`. Deux scans simultanés se sérialisent sur la ligne ; un seul passe, l'autre reçoit `ALREADY_USED`.
- **Aucune collision** : contraintes `UNIQUE` sur `id`, `ticket_code`, `token_hash` ; nouveau tirage automatique si collision.

### Structure

```
app/            login, dashboard, tickets(/[id]), scan, verify/[token], audit, settings, api/{tickets,scan,auth}
components/     layout, ticket, scanner, dashboard
lib/            supabase/ (client, server, admin) · security/ (tokens, auth, http, rate-limit, audit)
                validation/ · qr/ · pdf/ · tickets/service.ts
supabase/       migrations/0001_init.sql · seed.sql
tests/          unit/ · sql/ · integration/
assets/         affiches officielles + ticket-background.jpg (voir assets/README.md) · scripts/build-ticket-background.js
```

### Rôles

| Action | SUPER_ADMIN | ADMIN | SCANNER |
|---|:-:|:-:|:-:|
| Générer / télécharger un ticket | ✅ | ✅ | ❌ |
| Révoquer | ✅ | ✅ | ❌ |
| Réactiver | ✅ | ❌ | ❌ |
| Scanner / valider | ✅ | ✅ | ✅ |
| Voir tickets, audit, paramètres | ✅ | ✅ | ❌ |

Les permissions sont vérifiées **trois fois** : middleware (connexion), route API (`requireActor`), fonction SQL (rôle relu en base). Masquer un bouton n'est jamais la seule protection.

### Résultats de scan

`VALID` 🟢 · `ALREADY_USED` 🟠 (date, heure, point de contrôle de la 1re validation) · `INVALID` 🔴 · `REVOKED` 🔴 · `EXPIRED` 🔴 · `EVENT_INACTIVE` 🔴.
Deux modes : **Entrée** (consomme le ticket) et **Vérif. seule** (lecture sans consommer). Scanner le QR avec l'appareil photo natif ouvre `/verify/<token>` : connexion requise, puis vérification **sans consommer**, avec un bouton explicite « VALIDER L'ENTRÉE ».

---

## 2. Installation

Prérequis : Node ≥ 18.18, un projet Supabase.

```bash
npm install
cp .env.example .env.local      # puis remplir (voir §3)
```

1. Supabase → **SQL Editor** : exécuter `supabase/migrations/0001_init.sql`, puis `supabase/seed.sql`.
2. Supabase → Authentication → Providers → Email : **désactiver « Allow new users to sign up »**.
3. Créer le premier compte (Authentication → Users → Add user), puis dans le SQL Editor :
   ```sql
   insert into public.profiles (id, email, full_name, role)
   select id, email, 'Votre nom', 'SUPER_ADMIN' from auth.users where email = 'vous@exemple.com';
   ```
   Un compte Auth **sans** ligne dans `profiles` n'a aucun accès. Les comptes de scan se créent pareil avec le rôle `SCANNER`.
4. Renseigner lieu et date de l'événement :
   ```sql
   update public.events set venue = 'Votre lieu' where slug = 'nuit-sans-fin';   -- date : 12/12/2026 à 18h (déjà renseignée)
   ```
5. `npm run dev` → http://localhost:3000 (le scanner caméra exige HTTPS ou localhost).

## 3. Variables d'environnement

| Variable | Type | Rôle |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | publique | URL du projet |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publique | clé anon (protégée par la RLS) |
| `NEXT_PUBLIC_APP_URL` | publique | domaine encodé dans les QR — **à fixer définitivement avant d'imprimer** |
| `NEXT_PUBLIC_TIMEZONE` | publique | fuseau d'affichage (défaut Africa/Libreville) |
| `SUPABASE_SERVICE_ROLE_KEY` | **SECRÈTE** | serveur uniquement, jamais `NEXT_PUBLIC_` |
| `AUDIT_HASH_SALT` | **SECRÈTE** | sel pour hacher les IP dans les journaux |
| `DEFAULT_EVENT_SLUG` | secrète | événement des nouveaux tickets |

## 4. Déploiement (Vercel + Supabase)

1. Un projet Supabase **par environnement** (`dev`, `staging`, `prod`) ; appliquer la migration sur chacun.
2. Importer le dépôt dans Vercel ; définir les variables par environnement (Production / Preview / Development). Marquer les secrètes comme *Sensitive*.
3. `NEXT_PUBLIC_APP_URL` = votre domaine final en HTTPS.
4. Supabase → Authentication → URL Configuration : ajouter le domaine du site.
5. Avant l'événement : générer un ticket de test, l'imprimer et le scanner avec un vrai téléphone **sur la 4G** (pas seulement le Wi-Fi).

## 5. Tests

```bash
npm test                         # unitaires : tokens, validation, QR/PDF  (+ intégration si variables définies)
```

Intégration (projet Supabase de **test**) : `TEST_SUPABASE_URL`, `TEST_SUPABASE_SERVICE_ROLE_KEY`, et `TEST_BASE_URL=http://localhost:3000` pour les tests d'accès sans authentification.

Tests SQL (Postgres local 15+, sans Supabase) :
```bash
createdb chill && P="psql -d chill -v ON_ERROR_STOP=1 -q"
$P -f tests/sql/00_supabase_stub.sql && $P -f supabase/migrations/0001_init.sql
psql -d chill -f tests/sql/verify.sql
PSQL="psql -d chill" bash tests/sql/concurrency.sh 40
```

Couverture des 8 scénarios demandés : création (T1), scan valide (T2), 2e scan (T3), token modifié (T4), faux QR (T5), révocation (T6), accès sans authentification (T7), scans simultanés (T8).

## 6. Limites connues et honnêteté technique

- **Aucun ticket n'est « impossible à falsifier ».** Une photo du QR peut être copiée : c'est le serveur qui garantit qu'une seule copie entre (la première scannée ; l'autre est refusée). Si le vrai client est scanné après un fraudeur, c'est lui qui sera refusé : formez les contrôleurs à comparer l'identité du porteur au nom affiché, et à utiliser l'historique du ticket.
- **Rate limit** : fenêtre fixe stockée en Postgres. Suffisant pour ce besoin ; pour un très fort trafic, passer à Upstash Redis.
- **IP derrière Vercel** : lue depuis `x-forwarded-for`, hachée avant stockage.
- **Mode hors-ligne** : voir §7.
- Le fond du PDF vient de l'affiche officielle (`assets/ticket-background.jpg`) ; organisateur, sponsor et préfixe de code se changent dans `lib/pdf/branding.ts` (le préfixe `NSF` est aussi dans la contrainte SQL de `tickets.ticket_code` et dans `lib/security/tokens.ts`).

## 7. Mode hors-ligne (étude, non implémenté volontairement)

Le serveur étant la seule source de vérité, tout mode hors-ligne affaiblit la sécurité. Options réalistes :

| Option | Principe | Compromis |
|---|---|---|
| **A. Liste locale signée** (recommandée si le Wi-Fi est incertain) | Avant l'ouverture des portes, chaque téléphone télécharge la liste des hashes de tokens ACTIFS (chiffrée, expirant). Les scans hors-ligne sont validés localement et mis en file, puis synchronisés. | Deux portes hors-ligne peuvent accepter la **même** copie ; les doublons ne sont détectés qu'à la synchro. Une liste volée expose les hashes (pas les tokens). |
| **B. Un seul poste maître** | Un ordinateur local fait autorité pour toutes les portes sur un réseau local. | Matériel et point de défaillance unique. |
| **C. Rester en ligne** | Un routeur 4G de secours. | Le plus sûr et le plus simple. |

Recommandation : **C d'abord** (partage de connexion 4G sur 2 téléphones), puis A seulement si le lieu n'a vraiment pas de réseau, avec un nombre limité de portes hors-ligne.

## 8. Améliorations V2

Import CSV en lot · envoi du pass par e-mail / WhatsApp · gestion des utilisateurs et des événements depuis l'interface · catégories (VIP, standard) · QR dynamique à rotation · statistiques d'entrées en temps réel (Supabase Realtime) · authentification à deux facteurs pour les admins · PWA installable avec mode hors-ligne (option A) · export CSV de l'audit · filigrane / hologramme imprimé.
