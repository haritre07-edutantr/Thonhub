import { requestSignIn } from '../../../../lib/auth';
import { sameOrigin } from '../../../../lib/request-security';
export const runtime = 'nodejs';
export const maxDuration = 30;
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  try { return Response.json(await requestSignIn(await request.json(), request), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not send your sign-in link.' }, { status: 400 }); }
}
