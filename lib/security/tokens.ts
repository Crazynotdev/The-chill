import { createHash, randomBytes, randomInt } from 'node:crypto';

/**
 * Alphabet sans caractères ambigus (0/O, 1/I/L) : 31 symboles.
 * Code lisible NSF-XXXX-XXXX → 31^8 ≈ 8,5·10^11 combinaisons.
 * Le code n'est PAS le secret principal (c'est le token 256 bits) : il sert à la saisie manuelle,
 * et l'endpoint de scan est authentifié + limité en débit + verrouillé après échecs répétés.
 */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export const TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/; // 32 octets en base64url
export const CODE_REGEX = /^NSF-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;

/** Token de validation : 256 bits issus du CSPRNG du système. Contenu du QR. */
export function generateValidationToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Seul le hash SHA-256 du token est stocké en base : une fuite de la base ne permet pas de forger un QR. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Code lisible, tirage uniforme via `crypto.randomInt` (CSPRNG, sans biais de modulo). */
export function generateTicketCode(): string {
  const part = () => Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
  return `NSF-${part()}-${part()}`;
}

/** Normalise une saisie manuelle ("nsf 7x92 kp4m", "7X92KP4M"…) vers NSF-XXXX-XXXX, ou null. */
export function normalizeCode(raw: string): string | null {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const body = compact.startsWith('NSF') ? compact.slice(3) : compact;
  if (!/^[2-9A-HJKMNP-Z]{8}$/.test(body)) return null;
  return `NSF-${body.slice(0, 4)}-${body.slice(4)}`;
}

export type ParsedScanInput = { kind: 'token'; token: string } | { kind: 'code'; code: string } | null;

/**
 * Interprète ce que renvoie le scanner : URL de vérification, token brut ou code lisible.
 * Toute autre entrée est traitée comme INVALIDE (et comptabilisée).
 */
export function parseScanInput(raw: string): ParsedScanInput {
  const s = raw.trim();
  if (/^https?:\/\//i.test(s)) {
    try {
      const m = new URL(s).pathname.match(/\/verify\/([A-Za-z0-9_-]{43})\/?$/);
      return m && m[1] ? { kind: 'token', token: m[1] } : null;
    } catch {
      return null;
    }
  }
  if (TOKEN_REGEX.test(s)) return { kind: 'token', token: s };
  const code = normalizeCode(s);
  return code ? { kind: 'code', code } : null;
}
