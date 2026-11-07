import { describe, expect, it } from 'vitest';
import { buildTicketPdf } from '@/lib/pdf/ticket';
import { buildVerifyUrl, generateQrPng } from '@/lib/qr';
import { generateValidationToken } from '@/lib/security/tokens';

describe('QR code et PDF', () => {
  it('le QR encode uniquement une URL de vérification avec le token', () => {
    const token = generateValidationToken();
    const url = buildVerifyUrl(token, 'https://tickets.example.com/');
    expect(url).toBe(`https://tickets.example.com/verify/${token}`);
    expect(url).not.toMatch(/nom|name|email/i);
  });

  it('génère un vrai PDF sur une page, même avec des noms exotiques ou très longs', async () => {
    const qrPng = await generateQrPng(buildVerifyUrl(generateValidationToken(), 'https://tickets.example.com'));
    expect(qrPng.subarray(0, 4).toString('hex')).toBe('89504e47'); // signature PNG

    for (const participantName of ['Jean Dupont', 'Élodie-Marie Ndong Obiang', '李小龍 Bruce', 'A'.repeat(80)]) {
      const pdf = await buildTicketPdf({
        participantName,
        ticketCode: 'NSF-7X92-KP4M',
        qrPng,
        eventName: 'NUIT SANS FIN',
        venue: 'Libreville',
        startsAt: new Date('2026-12-12T19:00:00+01:00'),
        issuedAt: new Date(),
      });
      expect(Buffer.from(pdf.subarray(0, 5)).toString()).toBe('%PDF-');
      expect(pdf.length).toBeGreaterThan(2000);
    }
  });
});
