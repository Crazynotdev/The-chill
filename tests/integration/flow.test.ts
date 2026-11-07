/**
 * Tests d'intégration contre un VRAI projet Supabase (utiliser un projet de test / staging, jamais la production).
 * Ignorés automatiquement si les variables ne sont pas définies.
 *
 *   TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_ROLE_KEY   → tests de la logique en base (T1–T6, T8)
 *   TEST_BASE_URL (ex. http://localhost:3000)           → tests HTTP sans authentification (T7)
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { generateTicketCode, generateValidationToken, hashToken } from '@/lib/security/tokens';

const url = process.env.TEST_SUPABASE_URL;
const key = process.env.TEST_SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.TEST_BASE_URL;

describe.skipIf(!url || !key)('flux complet en base (Supabase réel)', () => {
  const db = createClient(url ?? 'http://invalid', key ?? 'invalid', { auth: { persistSession: false } });
  const run = randomUUID().slice(0, 8);
  const ids = { admin: '', scanner: '', event: '' };
  const tickets: string[] = [];

  async function mkUser(role: 'ADMIN' | 'SCANNER') {
    const { data, error } = await db.auth.admin.createUser({
      email: `test-${role.toLowerCase()}-${run}@example.test`,
      password: randomUUID(),
      email_confirm: true,
    });
    if (error || !data.user) throw error;
    await db.from('profiles').insert({ id: data.user.id, email: data.user.email, role });
    return data.user.id;
  }

  async function issue(name: string) {
    const token = generateValidationToken();
    const id = randomUUID();
    const { data, error } = await db.rpc('issue_ticket', {
      p_id: id,
      p_event_id: ids.event,
      p_name: name,
      p_code: generateTicketCode(),
      p_token_hash: hashToken(token),
      p_issued_at: new Date().toISOString(),
      p_pdf_path: null,
      p_actor: ids.admin,
      p_session: null,
      p_ip_hash: null,
    });
    expect(error).toBeNull();
    tickets.push(id);
    return { token, id, ticket: data };
  }

  const scan = async (token: string, mode: 'ENTRY' | 'CHECK' = 'ENTRY') => {
    const { data, error } = await db.rpc('verify_ticket', {
      p_token_hash: hashToken(token),
      p_code: null,
      p_mode: mode,
      p_actor: ids.scanner,
      p_checkpoint: 'Test',
      p_ip_hash: null,
      p_session: null,
    });
    expect(error).toBeNull();
    return (data as { result: string }).result;
  };

  beforeAll(async () => {
    ids.admin = await mkUser('ADMIN');
    ids.scanner = await mkUser('SCANNER');
    const { data } = await db
      .from('events')
      .insert({ slug: `test-${run}`, name: `TEST ${run}` })
      .select('id')
      .single();
    ids.event = data!.id;
  });

  afterAll(async () => {
    // Les journaux sont immuables par conception : on ne nettoie que les comptes de test.
    await db.auth.admin.deleteUser(ids.admin).catch(() => undefined);
    await db.auth.admin.deleteUser(ids.scanner).catch(() => undefined);
  });

  it('T1 crée un ticket (sans jamais renvoyer le hash)', async () => {
    const { ticket } = await issue('Jean Dupont');
    expect(ticket.status).toBe('ACTIVE');
    expect(ticket).not.toHaveProperty('token_hash');
  });

  it('T2/T3 scan valide puis déjà utilisé', async () => {
    const { token } = await issue('Marie Curie');
    expect(await scan(token)).toBe('VALID');
    expect(await scan(token)).toBe('ALREADY_USED');
  });

  it('T4/T5 token modifié ou faux QR → INVALID', async () => {
    const { token } = await issue('Paul Martin');
    expect(await scan(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'))).toBe('INVALID');
    expect(await scan(generateValidationToken())).toBe('INVALID');
  });

  it('T6 ticket révoqué → REVOKED', async () => {
    const { token, id } = await issue('Aline Obame');
    const { error } = await db.rpc('set_ticket_status', {
      p_ticket_id: id,
      p_action: 'REVOKE',
      p_reason: 'test',
      p_actor: ids.admin,
      p_session: null,
      p_ip_hash: null,
    });
    expect(error).toBeNull();
    expect(await scan(token)).toBe('REVOKED');
  });

  it('T8 vingt scans simultanés → une seule validation', async () => {
    const { token } = await issue('Course Critique');
    const results = await Promise.all(Array.from({ length: 20 }, () => scan(token)));
    expect(results.filter((r) => r === 'VALID')).toHaveLength(1);
    expect(results.filter((r) => r === 'ALREADY_USED')).toHaveLength(19);
  });

  it('T8b deux émissions simultanées ne collisionnent jamais', async () => {
    const batch = await Promise.all(Array.from({ length: 10 }, (_, i) => issue(`Parallèle ${String.fromCharCode(65 + i)}`)));
    expect(new Set(batch.map((b) => b.ticket.ticket_code)).size).toBe(10);
  });
});

describe.skipIf(!baseUrl)('accès sans authentification (application lancée)', () => {
  const get = (path: string) => fetch(`${baseUrl}${path}`, { redirect: 'manual' });
  const post = (path: string, body: unknown = {}) =>
    fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('T7 les pages d’administration redirigent vers /login', async () => {
    for (const p of ['/dashboard', '/tickets', '/settings', '/audit', '/scan']) {
      const res = await get(p);
      expect([301, 302, 303, 307, 308], p).toContain(res.status);
      expect(res.headers.get('location'), p).toContain('/login');
    }
  });

  it('T7 les API répondent 401 sans session', async () => {
    expect((await post('/api/tickets', { participantName: 'Jean Dupont' })).status).toBe(401);
    expect((await post('/api/scan', { input: 'NSF-7X92-KP4M' })).status).toBe(401);
    expect((await get('/api/tickets/00000000-0000-0000-0000-000000000000/pdf')).status).toBe(401);
  });

  it('refuse les requêtes qui ne sont pas en JSON (défense CSRF)', async () => {
    const res = await fetch(`${baseUrl}/api/scan`, { method: 'POST', body: 'input=x', headers: { 'Content-Type': 'text/plain' } });
    expect([401, 415]).toContain(res.status);
  });
});
