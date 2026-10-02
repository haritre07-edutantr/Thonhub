'use client';
import { useState } from 'react';
import { Mail, ShieldCheck, Sparkles } from 'lucide-react';
import AuthFrame from './auth-frame';
export default function SignInForm({ returnTo = '/' }: { returnTo?: string }) {
  const [signup, setSignup] = useState(false), [email, setEmail] = useState(''), [name, setName] = useState(''), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (window.location.protocol === 'file:') throw new Error('Open the deployed Thon Hub website to sign in. This downloaded file previews the site.');
      const response = await fetch('/api/auth/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name: signup ? name : '', returnTo }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not send the sign-in link.');
      setMessage(result.message);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again.'); }
    finally { setBusy(false); }
  }
  return <AuthFrame><section className="auth-card"><div className="auth-icon"><Sparkles size={28}/></div><p className="eyebrow">YOUR NEXT MOVE STARTS HERE</p><h1>{signup ? 'Join the ' : 'Welcome '}<em>{signup ? 'hub.' : 'back.'}</em></h1><p>One email. Your events, tickets and next big idea.</p><div className="auth-tabs"><button className={!signup ? 'chosen' : ''} onClick={()=>{setSignup(false);setError('');}}>Sign in</button><button className={signup ? 'chosen' : ''} onClick={()=>{setSignup(true);setError('');}}>Create account</button></div><form onSubmit={submit}>{signup && <label>Your name<input autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)} placeholder="What should we call you?"/></label>}<label>Email address<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><button className="primary auth-submit" disabled={busy}><Mail size={18}/>{busy ? 'Sending your link…' : 'Send my sign-in link'}</button></form>{message && <p className="auth-message" role="status">{message}</p>}{error && <p className="auth-error" role="alert">{error}</p>}<p className="auth-footnote"><ShieldCheck size={18}/>Confirm the link in your inbox to sign in. No password to remember.</p></section></AuthFrame>;
}
