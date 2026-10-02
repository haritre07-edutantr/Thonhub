export function sameOrigin(request: Request): boolean {
  const supplied = request.headers.get('origin');
  if (!supplied) return false;
  try {
    const origin = new URL(supplied), url = new URL(request.url);
    const host = request.headers.get('host') || url.host;
    const protocol = (request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '')).split(',')[0].trim();
    if (!['http', 'https'].includes(protocol) || !['http:', 'https:'].includes(origin.protocol)) return false;
    return supplied === origin.origin && origin.origin === new URL(protocol + '://' + host).origin;
  } catch { return false; }
}
export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || value.length > 1000 || !value.startsWith('/') || value.startsWith('//')) return '/';
  try {
    const url = new URL(value, 'https://thon.local');
    if (url.origin !== 'https://thon.local' || /^\/(?:api|auth|signin|signout)(?:\/|$)/.test(url.pathname)) return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}
export function applicationOrigin(): string {
  const value = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://localhost:3000');
  const url = new URL(value);
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('APP_URL must be the HTTPS address of your website.');
  return url.origin;
}
