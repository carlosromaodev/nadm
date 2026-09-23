/** Keep sharing on the actual origin, including the development tunnel. */
export function profileShareUrl(origin: string, handle: string): string {
  const url = new URL(origin);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid profile origin');
  if (!/^[a-zA-Z0-9_-]{3,30}$/.test(handle)) throw new Error('Invalid profile handle');
  return `${url.origin}/${encodeURIComponent(handle)}`;
}

export async function createProfileQr(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Invalid profile URL');
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 4, width: 720, color: { dark: '#16281eff', light: '#ffffffff' } });
}
