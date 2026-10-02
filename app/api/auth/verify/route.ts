import { confirmSignIn } from '../../../../lib/auth';
import { sameOrigin } from '../../../../lib/request-security';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  try { const input = await request.json(); return Response.json(await confirmSignIn(input.token), { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Could not confirm your email.' }, { status: 400 }); }
}
