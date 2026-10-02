import { cookies } from 'next/headers';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { database } from './database';
import { applicationOrigin, safeReturnPath } from './request-security';

export type Account = { userId: string; email: string; displayName: string; fullName: string | null };
export const SESSION_COOKIE = 'thonhub_session';
const SESSION_SECONDS = 14 * 24 * 60 * 60;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));

export async function currentUser(): Promise<Account | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const user = await database().prepare('SELECT u.id,u.email,u.name FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.email_verified=1').bind(digest(token), new Date().toISOString()).first<any>();
  return user ? { userId: user.id, email: user.email, displayName: user.name || user.email, fullName: user.name || null } : null;
}

async function rateLimit(key: string, limit: number, now: Date) {
  const bucket = key + ':' + Math.floor(now.getTime() / 900000);
  const result = await database().prepare('INSERT INTO auth_limits(bucket,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(bucket, new Date(now.getTime() + 1800000).toISOString()).first<any>();
  if (result.attempts > limit) throw new Error('Too many sign-in requests. Please wait 15 minutes before trying again.');
}

export async function requestSignIn(input: any, request: Request) {
  const email = String(input.email || '').trim().toLowerCase();
  const name = String(input.name || '').trim();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || /[\r\n]/.test(email)) throw new Error('Enter a valid email address.');
  if (name.length > 100 || /[\r\n\x00-\x1f]/.test(name)) throw new Error('Enter a name of up to 100 characters.');
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new Error('Email sign-in has not been connected yet.');
  const origin = applicationOrigin();
  const now = new Date();
  await rateLimit('email:' + digest(email), 5, now);
  const ip = request.headers.get('x-vercel-forwarded-for') || request.headers.get('x-forwarded-for') || 'local';
  await rateLimit('ip:' + digest(ip.split(',')[0].trim()), 30, now);
  const token = randomBytes(32).toString('hex');
  await database().prepare('INSERT INTO auth_tokens(token_hash,email,name,return_to,expires_at,created_at) VALUES(?,?,?,?,?,?)').bind(digest(token), email, name, safeReturnPath(input.returnTo), new Date(now.getTime() + 900000).toISOString(), now.toISOString()).run();
  const link = origin + '/auth/verify?token=' + token;
  const text = 'Sign in to Thon Hub\n\nOpen this link to confirm your email and sign in:\n' + link + '\n\nThis link expires in 15 minutes and works once. If you did not request it, you can ignore this email.\n\nThon Hub — Powered by Edutantr';
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json', 'User-Agent': 'ThonHub/1.0', 'Idempotency-Key': 'signin-' + digest(token) },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject: 'Your Thon Hub sign-in link', text, html: '<main style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#171717"><h1>Sign in to Thon Hub</h1><p>Confirm your email to sign in or create your account.</p><p><a href="' + escapeHtml(link) + '" style="display:inline-block;background:#ff8508;color:#111;padding:14px 22px;border-radius:8px;font-weight:700">Confirm my email</a></p><p>This link expires in 15 minutes and works once. If you did not request it, you can ignore this email.</p><p>Thon Hub · Powered by Edutantr</p></main>' }),
    });
    if (!response.ok) throw new Error('The sign-in email could not be sent. Please try again later.');
    const result: any = await response.json();
    if (!result.id) throw new Error('The sign-in email could not be confirmed. Please request a new link.');
  } catch (error) {
    await database().prepare('DELETE FROM auth_tokens WHERE token_hash=?').bind(digest(token)).run();
    throw error;
  }
  await database().batch([
    database().prepare('DELETE FROM auth_tokens WHERE expires_at<=?').bind(now.toISOString()),
    database().prepare('DELETE FROM auth_sessions WHERE expires_at<=?').bind(now.toISOString()),
    database().prepare('DELETE FROM auth_limits WHERE expires_at<=?').bind(now.toISOString()),
  ]);
  return { ok: true, message: 'Check your email for a sign-in link. It expires in 15 minutes.' };
}

export async function confirmSignIn(token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('This sign-in link is invalid. Request a new link.');
  const now = new Date();
  const row = await database().prepare('DELETE FROM auth_tokens WHERE token_hash=? AND expires_at>? RETURNING email,name,return_to').bind(digest(token), now.toISOString()).first<any>();
  if (!row) throw new Error('This sign-in link has expired or was already used. Request a new link.');
  await database().prepare('INSERT INTO auth_users(id,email,name,email_verified,created_at) VALUES(?,?,?,1,?) ON CONFLICT(email) DO NOTHING').bind(randomUUID(), row.email, row.name || row.email.split('@')[0], now.toISOString()).run();
  const user = await database().prepare('SELECT id FROM auth_users WHERE email=? AND email_verified=1').bind(row.email).first<any>();
  if (!user) throw new Error('Your account could not be opened. Request a new sign-in link.');
  const session = randomBytes(32).toString('hex');
  await database().prepare('INSERT INTO auth_sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').bind(digest(session), user.id, new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString(), now.toISOString()).run();
  (await cookies()).set(SESSION_COOKIE, session, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS });
  return { ok: true, returnTo: safeReturnPath(row.return_to) };
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await database().prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(digest(token)).run();
  jar.delete(SESSION_COOKIE);
  return { ok: true };
}
