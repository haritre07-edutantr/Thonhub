import { get, del } from '@vercel/blob';
import { db } from './hub';
import { fileMime, MAX_FILE_SIZE } from './file-types';
const publicAsset = (a: any) => ({ id: a.id, name: a.name, mime: a.mime, kind: a.kind, size: a.size });
export async function finalizeAsset(id: string) {
  const existing = await db().prepare('SELECT * FROM assets WHERE id=?').bind(id).first<any>();
  if (existing) return publicAsset(existing);
  const pending = await db().prepare('SELECT * FROM pending_uploads WHERE id=?').bind(id).first<any>();
  if (!pending) throw new Error('This upload is unavailable. Upload the file again.');
  const object = await get(pending.pathname, { access: 'private' });
  if (!object || object.statusCode !== 200 || !object.stream) throw new Error('The uploaded file is not available yet. Try again.');
  const invalid = async (message: string) => { await del(pending.pathname); await db().prepare('DELETE FROM pending_uploads WHERE id=?').bind(id).run(); throw new Error(message); };
  if (object.blob.size !== pending.size || pending.size < 1 || pending.size > MAX_FILE_SIZE) { await object.stream.cancel(); return invalid('Each file must be 10 MB or smaller and match the upload details.'); }
  const reader = object.stream.getReader();
  let prefix: Uint8Array = new Uint8Array(0);
  try {
    while (prefix.length < 12) {
      const { value, done } = await reader.read();
      if (done) break;
      const joined = new Uint8Array(Math.min(12, prefix.length + value.length));
      joined.set(prefix); joined.set(value.slice(0, 12 - prefix.length), prefix.length); prefix = joined;
    }
  } finally { await reader.cancel(); }
  const mime = fileMime(prefix);
  if (!mime) return invalid('Use a PDF, JPG, PNG or WebP file.');
  await db().prepare('INSERT INTO assets(id,event_id,key,name,mime,kind,size,created_at) VALUES(?,NULL,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id, pending.pathname, pending.name, mime, pending.kind, pending.size, new Date().toISOString()).run();
  await db().prepare('DELETE FROM pending_uploads WHERE id=?').bind(id).run();
  return publicAsset(await db().prepare('SELECT * FROM assets WHERE id=?').bind(id).first<any>());
}
