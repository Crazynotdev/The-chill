import { describe, expect, it } from 'vitest';
import { createTicketSchema, scanSchema, statusActionSchema } from '@/lib/validation/schemas';

describe('validation du nom du participant', () => {
  const parse = (participantName: unknown) => createTicketSchema.safeParse({ participantName });

  it('accepte noms accentués, composés, avec apostrophes', () => {
    for (const n of ['Jean Dupont', 'Élodie-Marie N’Dong', "Jean-Pierre O'Neil", 'Zoë Müller', 'Li Wei', 'Anne  de   la Tour']) {
      expect(parse(n).success, n).toBe(true);
    }
  });

  it('normalise les espaces', () => {
    const r = parse('  Jean    Dupont ');
    expect(r.success && r.data.participantName).toBe('Jean Dupont');
  });

  it('refuse vide, trop court, trop long, types inattendus', () => {
    for (const n of ['', ' ', 'A', 'x'.repeat(81), null, 42, {}, ['Jean']]) {
      expect(parse(n).success, String(n)).toBe(false);
    }
  });

  it('refuse caractères problématiques et tentatives d’injection', () => {
    for (const n of [
      '<script>alert(1)</script>',
      "Robert'); DROP TABLE tickets;--",
      'Jean\u0000Dupont',
      'Jean\nDupont;',
      '{{7*7}}',
      '../../etc/passwd',
      'Jean@Dupont',
      '12345',
    ]) {
      expect(parse(n).success, n).toBe(false);
    }
  });

  it('refuse les champs supplémentaires (schéma strict)', () => {
    expect(createTicketSchema.safeParse({ participantName: 'Jean Dupont', role: 'ADMIN' }).success).toBe(false);
  });
});

describe('autres schémas', () => {
  it('scan : mode et point de contrôle contrôlés', () => {
    expect(scanSchema.safeParse({ input: 'NSF-7X92-KP4M' }).success).toBe(true);
    expect(scanSchema.safeParse({ input: 'NSF-7X92-KP4M', mode: 'ADMIN' }).success).toBe(false);
    expect(scanSchema.safeParse({ input: 'NSF-7X92-KP4M', checkpoint: '<b>x</b>' }).success).toBe(false);
    expect(scanSchema.safeParse({ input: 'x'.repeat(301) }).success).toBe(false);
  });

  it('statut : actions limitées', () => {
    expect(statusActionSchema.safeParse({ action: 'REVOKE', reason: 'fraude' }).success).toBe(true);
    expect(statusActionSchema.safeParse({ action: 'DELETE' }).success).toBe(false);
    expect(statusActionSchema.safeParse({ action: 'REVOKE', reason: 'x'.repeat(201) }).success).toBe(false);
  });
});
