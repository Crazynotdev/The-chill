// Génère assets/ticket-background.jpg (600 × 320 pt à 4 px/pt = 2400 × 1280) à partir de l'affiche officielle.
// Usage : node scripts/build-ticket-background.js [affiche.png]     (nécessite `sharp`)
const sharp = require('sharp');
const path = require('node:path');

const SRC = process.argv[2] || path.join(__dirname, '..', 'assets', 'source-poster-red.png');
const OUT = path.join(__dirname, '..', 'assets', 'ticket-background.jpg');
const PX = 4, W = 600 * PX, H = 320 * PX, MAIN_W = 420 * PX;

(async () => {
  // Zone de l'affiche affichée dans la partie principale (ratio 420:320).
  const crop = { left: 70, top: 385, width: 1100, height: Math.round((1100 * 320) / 420) };
  const main = await sharp(SRC).extract(crop).resize(MAIN_W, H, { fit: 'fill' }).toBuffer();

  const svg = (body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${body}</svg>`);
  const fade = svg(`<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0.7" stop-color="#0a0305" stop-opacity="0"/><stop offset="0.9" stop-color="#0a0305" stop-opacity="0.88"/><stop offset="1" stop-color="#0a0305" stop-opacity="0.95"/></linearGradient>
      <linearGradient id="r" x1="0" y1="0" x2="1" y2="0"><stop offset="0.9" stop-color="#0a0305" stop-opacity="0"/><stop offset="1" stop-color="#0a0305" stop-opacity="0.85"/></linearGradient></defs>
    <rect width="${MAIN_W}" height="${H}" fill="url(#g)"/><rect width="${MAIN_W}" height="${H}" fill="url(#r)"/>`);
  const stub = svg(`<defs><radialGradient id="s" cx="0.5" cy="0.15" r="0.9"><stop offset="0" stop-color="#7a0f1c" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#0a0305" stop-opacity="0"/></radialGradient></defs>
    <rect x="${MAIN_W}" width="${W - MAIN_W}" height="${H}" fill="#0a0305"/><rect x="${MAIN_W}" width="${W - MAIN_W}" height="${H}" fill="url(#s)"/>
    <rect width="${12}" height="${H}" fill="#e11d2e"/>`);

  await sharp({ create: { width: W, height: H, channels: 3, background: '#0a0305' } })
    .composite([{ input: stub }, { input: main, left: 0, top: 0 }, { input: fade }])
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(OUT);
  console.log('OK →', OUT);
})();
