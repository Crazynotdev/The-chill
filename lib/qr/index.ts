import QRCode from 'qrcode';

/**
 * Le QR ne contient QUE une URL de vérification avec le token aléatoire (256 bits).
 * Aucun nom, e-mail ou donnée personnelle : le serveur retrouve le ticket par le hash du token.
 */
export function buildVerifyUrl(token: string, baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''): string {
  return `${baseUrl.replace(/\/+$/, '')}/verify/${token}`;
}

/** PNG haute définition, correction d'erreur M (bon compromis lisibilité / densité). */
export function generateQrPng(content: string, width = 640): Promise<Buffer> {
  return QRCode.toBuffer(content, { type: 'png', errorCorrectionLevel: 'M', margin: 1, width });
}
