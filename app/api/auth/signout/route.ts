import { signOut } from '../../../../lib/auth';
import { sameOrigin } from '../../../../lib/request-security';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Request origin is not allowed.' }, { status: 403 });
  return Response.json(await signOut(), { headers: { 'Cache-Control': 'no-store' } });
}
