/**
 * UUIDv7 (RFC 9562): 48 bit di timestamp in ms, versione 7, variante 10, resto casuale.
 * Ordinabile nel tempo: utile come `id` stabile delle righe.
 */
export function uuidv7(
  now: number = Date.now(),
  random: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer> = (b) =>
    crypto.getRandomValues(b),
): string {
  const bytes = random(new Uint8Array(16));

  // 48 bit di timestamp, big endian. Non usiamo >> perché oltre 32 bit tronca.
  let ts = now;
  for (let i = 5; i >= 0; i--) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }

  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // versione 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variante RFC 4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
