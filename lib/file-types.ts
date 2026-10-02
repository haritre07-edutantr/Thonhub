export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export function fileMime(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes.slice(0, 12));
  if (text.startsWith('%PDF-')) return 'application/pdf';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes[0] === 137 && text.slice(1, 4) === 'PNG') return 'image/png';
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') return 'image/webp';
  return '';
}
