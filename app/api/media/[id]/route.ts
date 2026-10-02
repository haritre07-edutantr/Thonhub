import { get } from '@vercel/blob';
import { db, identity } from '../../../../lib/hub';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { admin } = await identity();
    const asset = await db().prepare('SELECT a.*,e.published FROM assets a LEFT JOIN events e ON e.id=a.event_id WHERE a.id=?').bind(id).first<any>();
    if (!asset || (!admin && !asset.published)) return new Response('File not found', { status: 404 });
    const object = await get(asset.key, { access: 'private' });
    if (!object || object.statusCode !== 200 || !object.stream) return new Response('File not found', { status: 404 });
    const download = new URL(request.url).searchParams.has('download');
    return new Response(object.stream, { headers: { 'Content-Type': asset.mime, 'Content-Length': String(asset.size), 'Content-Disposition': (download ? 'attachment' : 'inline') + "; filename*=UTF-8''" + encodeURIComponent(asset.name), 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': 'sandbox' } });
  } catch { return new Response('File is temporarily unavailable', { status: 503 }); }
}
