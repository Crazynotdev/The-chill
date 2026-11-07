import { describe, expect, it } from 'vitest';
import {
  CODE_REGEX,
  TOKEN_REGEX,
  generateTicketCode,
  generateValidationToken,
  hashToken,
  normalizeCode,
  parseScanInput,
} from '@/lib/security/tokens';

describe('génération des identifiants', () => {
  it('produit des tokens de 256 bits, uniques et au bon format', () => {
    const tokens = new Set(Array.from({ length: 5000 }, generateValidationToken));
    expect(tokens.size).toBe(5000);
    for (const t of tokens) expect(t).toMatch(TOKEN_REGEX);
  });

  it('produit des codes lisibles NSF-XXXX-XXXX sans caractères ambigus', () => {
    const codes = new Set(Array.from({ length: 5000 }, generateTicketCode));
    expect(codes.size).toBe(5000);
    for (const c of codes) {
      expect(c).toMatch(CODE_REGEX);
      expect(c.slice(4)).not.toMatch(/[01OIL]/);
    }
  });

  it('hache le token de façon déterministe (SHA-256 hex) et irréversible', () => {
    const t = generateValidationToken();
    expect(hashToken(t)).toBe(hashToken(t));
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(t)).not.toContain(t);
    expect(hashToken(t + 'x')).not.toBe(hashToken(t)); // token modifié → hash différent
  });
});

describe('interprétation de ce que renvoie le scanner', () => {
  const token = generateValidationToken();

  it('extrait le token d’une URL de vérification', () => {
    expect(parseScanInput(`https://tickets.example.com/verify/${token}`)).toEqual({ kind: 'token', token });
    expect(parseScanInput(`https://tickets.example.com/verify/${token}/`)).toEqual({ kind: 'token', token });
  });

  it('accepte un token brut', () => {
    expect(parseScanInput(token)).toEqual({ kind: 'token', token });
  });

  it('normalise la saisie manuelle du code', () => {
    expect(normalizeCode('nsf 7x92 kp4m')).toBe('NSF-7X92-KP4M');
    expect(normalizeCode('7X92KP4M')).toBe('NSF-7X92-KP4M');
    expect(parseScanInput('nsf-7x92-kp4m')).toEqual({ kind: 'code', code: 'NSF-7X92-KP4M' });
  });

  it('rejette tout le reste (faux QR, URL tronquée, caractères ambigus)', () => {
    expect(parseScanInput('hello world')).toBeNull();
    expect(parseScanInput('https://evil.example/verify/short')).toBeNull();
    expect(parseScanInput(`https://evil.example/other/${token}`)).toBeNull();
    expect(parseScanInput(token.slice(0, 42))).toBeNull();
    expect(parseScanInput('NSF-0O1I-LLLL')).toBeNull();
    expect(parseScanInput('')).toBeNull();
  });
});
