'use client';
import { useState } from 'react';
import { Mail, ShieldCheck } from 'lucide-react';
import AuthFrame from './auth-frame';
export default function VerifyForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function confirm() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not confirm this link.');
      window.location.replace(result.returnTo || '/');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again.'); setBusy(false); }
  }
  return <AuthFrame><section className="auth-card"><div className="auth-icon"><Mail size={28}/></div><p className="eyebrow">WELCOME TO YOUR NEXT EXPERIENCE</p><h1>You’re one <em>click away.</em></h1><p>Confirm your email to open your Thon Hub account.</p>{token ? <button className="primary auth-submit" disabled={busy} onClick={confirm}><ShieldCheck size={18}/>{busy ? 'Opening your account…' : 'Confirm and sign in'}</button> : <p className="auth-error">This link is incomplete. Request a new sign-in link.</p>}{error && <p className="auth-error" role="alert">{error}</p>}<a className="auth-back" href="/signin">Request a new sign-in link</a></section></AuthFrame>;
}
