import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { db, identity } from '../../../lib/hub';
import { sameOrigin } from '../../../lib/request-security';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from '../../../lib/file-types';
import { finalizeAsset } from '../../../lib/assets';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('File storage has not been connected.');
    const body = await request.json();
    if (body.action === 'finalize') {
      if (!sameOrigin(request)) return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
      const { user, admin } = await identity();
      if (!admin) return Response.json({ error: 'Administrator access is required.' }, { status: 403 });
      if (typeof body.id !== 'string' || !/^[a-f0-9-]{36}$/.test(body.id)) throw new Error('Invalid upload.');
      const pending = await db().prepare('SELECT user_id FROM pending_uploads WHERE id=?').bind(body.id).first<any>();
      if (pending && pending.user_id !== user!.userId) throw new Error('This upload belongs to another account.');
      return Response.json({ asset: await finalizeAsset(body.id), message: 'Uploaded. Save the event to publish this file.' });
    }
    const result = await handleUpload({
      body: body as HandleUploadBody, request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!sameOrigin(request)) throw new Error('Invalid request origin.');
        const { user, admin } = await identity();
        if (!admin) throw new Error('Administrator access is required.');
        if (!/^events\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(pathname)) throw new Error('Invalid upload path.');
        const metadata = JSON.parse(clientPayload || '{}');
        const size = Number(metadata.size);
        if (!Number.isInteger(size) || size < 1 || size > MAX_FILE_SIZE) throw new Error('Each file must be 10 MB or smaller.');
        const kind = metadata.kind === 'mentor' ? 'mentor' : 'event';
        const name = String(metadata.name || 'Event file').replace(/[\r\n\x00-\x1f]/g, '').slice(0, 180) || 'Event file';
        const id = pathname.slice('events/'.length);
        await db().prepare('INSERT INTO pending_uploads(id,user_id,pathname,name,kind,size,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id, user!.userId, pathname, name, kind, size, new Date().toISOString()).run();
        const saved = await db().prepare('SELECT * FROM pending_uploads WHERE id=?').bind(id).first<any>();
        if (!saved || saved.user_id !== user!.userId || saved.name !== name || saved.kind !== kind || saved.size !== size) throw new Error('Reopen the file picker and upload again.');
        return { allowedContentTypes: ALLOWED_FILE_TYPES, maximumSizeInBytes: MAX_FILE_SIZE, addRandomSuffix: false, allowOverwrite: false, tokenPayload: JSON.stringify({ id }) };
      },
      onUploadCompleted: async ({ tokenPayload }) => {
        const { id } = JSON.parse(tokenPayload || '{}');
        if (typeof id !== 'string') throw new Error('Invalid upload callback.');
        await finalizeAsset(id);
      },
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Upload failed. Please try again.' }, { status: 400 });
  }
}
