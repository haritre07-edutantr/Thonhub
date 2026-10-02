'use client';
import { upload } from '@vercel/blob/client';
import { fileMime, MAX_FILE_SIZE } from './file-types';
export async function uploadEventFile(file: File, kind: 'event' | 'mentor') {
  if (file.size < 1 || file.size > MAX_FILE_SIZE) throw new Error('Each file must be 10 MB or smaller.');
  const mime = fileMime(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (!mime) throw new Error('Use a PDF, JPG, PNG or WebP file.');
  const id = crypto.randomUUID();
  await upload('events/' + id, file, {
    access: 'private', handleUploadUrl: '/api/media', contentType: mime,
    clientPayload: JSON.stringify({ name: file.name, kind, size: file.size }),
    multipart: file.size > 4 * 1024 * 1024,
  });
  const response = await fetch('/api/media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'finalize', id }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Upload could not be saved.');
  return result;
}
