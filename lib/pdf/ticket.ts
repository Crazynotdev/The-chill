import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import { BRAND } from '@/lib/pdf/branding';

export interface TicketPdfInput {
  participantName: string;
  ticketCode: string;
  qrPng: Buffer;
  eventName: string;
  venue: string | null;
  startsAt: Date | null;
  issuedAt: Date;
}

// Format : 600 × 320 pt (≈ 21 × 11,3 cm). Partie principale = visuel officiel, talon (x ≥ 420) = QR.
const W = 600;
const H = 320;
const STUB_X = 420;
const STUB_W = W - STUB_X;
const TZ = () => process.env.NEXT_PUBLIC_TIMEZONE || 'Africa/Libreville';

const C = {
  bg: rgb(0.039, 0.012, 0.02),
  red: rgb(0.882, 0.114, 0.18),
  text: rgb(0.97, 0.96, 0.96),
  mute: rgb(0.66, 0.62, 0.63),
};

/**
 * Le visuel est généré par `scripts/build-ticket-background.js` depuis l'affiche officielle
 * (assets/ticket-background.jpg). Sans ce fichier on retombe sur un fond uni.
 */
async function loadBackground(): Promise<{ data: Buffer; kind: 'jpg' | 'png' } | null> {
  for (const [file, kind] of [['ticket-background.jpg', 'jpg'], ['ticket-background.png', 'png']] as const) {
    try {
      return { data: await readFile(path.join(process.cwd(), 'assets', file)), kind };
    } catch {
      /* essaie le suivant */
    }
  }
  return null;
}

/** Polices standard = WinAnsi seulement : on dégrade proprement ce qui n'est pas encodable. */
function safeText(font: PDFFont, text: string): string {
  try {
    font.encodeText(text);
    return text;
  } catch {
    const stripped = text.normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\x20-\x7E -ÿ]/g, '?');
    try {
      font.encodeText(stripped);
      return stripped;
    } catch {
      return stripped.replace(/[^\x20-\x7E]/g, '?');
    }
  }
}

function fitSize(font: PDFFont, text: string, maxWidth: number, start: number, min: number): number {
  let size = start;
  while (size > min && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5;
  return size;
}

function centered(font: PDFFont, text: string, size: number, left: number, width: number): number {
  return left + (width - font.widthOfTextAtSize(text, size)) / 2;
}

function dateLines(d: Date | null): [string, string] {
  if (!d) return ['DATE À CONFIRMER', ''];
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ(),
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const minutes = get('minute') === '00' ? '' : get('minute');
  return [`${get('day')} ${get('month')} ${get('year')}`.toUpperCase(), `À PARTIR DE ${Number(get('hour'))}H${minutes}`];
}

export async function buildTicketPdf(input: TicketPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${BRAND.appName} — ${input.ticketCode}`);
  pdf.setProducer(`${BRAND.appName} ticketing`);
  pdf.setCreator(`${BRAND.appName} ticketing`);

  const page = pdf.addPage([W, H]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const mono = await pdf.embedFont(StandardFonts.CourierBold);

  const bg = await loadBackground();
  if (bg) {
    const img = bg.kind === 'jpg' ? await pdf.embedJpg(bg.data) : await pdf.embedPng(bg.data);
    page.drawImage(img, { x: 0, y: 0, width: W, height: H });
  } else {
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: C.bg });
    page.drawRectangle({ x: 0, y: 0, width: 10, height: H, color: C.red });
    page.drawText(BRAND.appName, { x: 34, y: H - 70, size: 34, font: bold, color: C.text });
  }

  // ── Partie principale : nom du participant (bas du visuel) ──
  const name = safeText(bold, input.participantName.toUpperCase());
  page.drawText('PARTICIPANT', { x: 30, y: 56, size: 7.5, font: bold, color: C.mute });
  page.drawText(name, {
    x: 30,
    y: 28,
    size: fitSize(bold, name, STUB_X - 30 - 24, 26, 11),
    font: bold,
    color: C.text,
  });

  // ── Talon ──
  const cx = STUB_X + 10;
  const cw = STUB_W - 20;
  const [dayLine, timeLine] = dateLines(input.startsAt);
  const dayText = safeText(bold, dayLine);
  const daySize = fitSize(bold, dayText, cw, 14, 8);
  page.drawText(dayText, { x: centered(bold, dayText, daySize, cx, cw), y: 292, size: daySize, font: bold, color: C.text });
  if (timeLine) {
    const t = safeText(bold, timeLine);
    page.drawText(t, { x: centered(bold, t, 9, cx, cw), y: 277, size: 9, font: bold, color: C.red });
  }
  const venue = input.venue?.trim();
  if (venue && venue.toLowerCase() !== 'à confirmer') {
    const v = safeText(regular, venue);
    page.drawText(v, { x: centered(regular, v, 7.5, cx, cw), y: 264, size: 7.5, font: regular, color: C.mute });
  }

  // QR sur fond blanc : la zone de silence est indispensable à la lecture.
  const box = 132;
  const qx = STUB_X + (STUB_W - box) / 2;
  const qy = 120;
  page.drawRectangle({ x: qx, y: qy, width: box, height: box, color: rgb(1, 1, 1) });
  const qr = await pdf.embedPng(input.qrPng);
  page.drawImage(qr, { x: qx + 7, y: qy + 7, width: box - 14, height: box - 14 });

  const codeSize = fitSize(mono, input.ticketCode, cw, 13, 8);
  page.drawText(input.ticketCode, {
    x: centered(mono, input.ticketCode, codeSize, cx, cw),
    y: 100,
    size: codeSize,
    font: mono,
    color: C.text,
  });
  const hint = safeText(bold, 'SCANNER À L’ENTRÉE');
  page.drawText(hint, { x: centered(bold, hint, 6.5, cx, cw), y: 86, size: 6.5, font: bold, color: C.red });

  // Organisateur / sponsor (affiche officielle)
  for (const [i, [label, value]] of ([['ORGANISATEUR', BRAND.organizer], ['SPONSOR', BRAND.sponsor]] as const).entries()) {
    const y = 62 - i * 22;
    const l = safeText(regular, label);
    const v = safeText(bold, value);
    page.drawText(l, { x: centered(regular, l, 5.5, cx, cw), y: y + 8, size: 5.5, font: regular, color: C.mute });
    page.drawText(v, { x: centered(bold, v, 8.5, cx, cw), y, size: 8.5, font: bold, color: C.text });
  }

  const issued = new Intl.DateTimeFormat('fr-FR', { timeZone: TZ() }).format(input.issuedAt);
  const foot = safeText(regular, `Émis le ${issued} · 1 entrée · vérifié par scan officiel`);
  page.drawText(foot, { x: centered(regular, foot, 5, cx, cw), y: 12, size: 5, font: regular, color: C.mute });

  // Perforation
  for (let y = 10; y < H - 6; y += 10) {
    page.drawLine({ start: { x: STUB_X, y }, end: { x: STUB_X, y: y + 5 }, thickness: 0.9, color: C.mute, opacity: 0.55 });
  }

  return pdf.save();
}
