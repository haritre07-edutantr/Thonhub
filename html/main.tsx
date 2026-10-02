import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import Hub from '../app/hub';
import SignInForm from '../app/sign-in-form';
import VerifyForm from '../app/verify-form';
import '../app/globals.css';
import '../app/motion.css';
import '../app/admin-mail.css';
import '../app/auth.css';
const offline = window.location.protocol === 'file:';
const routeUrl = () => offline ? new URL(window.location.hash.slice(1).startsWith('/') ? window.location.hash.slice(1) : '/', 'https://thon.local') : new URL(window.location.href);
function App() {
  const [route, setRoute] = useState(routeUrl);
  useEffect(() => {
    const refresh = () => setRoute(routeUrl());
    const navigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement).closest('a');
      if (!anchor || anchor.hasAttribute('download')) return;
      const href = anchor.getAttribute('href') || '';
      if (!href.startsWith('/') || href.startsWith('//')) return;
      const url = new URL(href, 'https://thon.local');
      if (!['/', '/index.html', '/admin', '/my-events', '/signin', '/auth/verify'].includes(url.pathname)) return;
      event.preventDefault();
      if (offline) window.location.hash = href;
      else { history.pushState(null, '', href); refresh(); }
      window.scrollTo(0, 0);
    };
    document.addEventListener('click', navigate);
    window.addEventListener('popstate', refresh); window.addEventListener('hashchange', refresh);
    return () => { document.removeEventListener('click', navigate); window.removeEventListener('popstate', refresh); window.removeEventListener('hashchange', refresh); };
  }, []);
  const key = route.pathname + route.search;
  return <>{offline && <div className="offline-preview-note">Thon Hub preview · Open the deployed website to sign in, register and send emails.</div>}{route.pathname === '/signin' ? <SignInForm key={key} returnTo={route.searchParams.get('return_to') || '/'}/> : route.pathname === '/auth/verify' ? <VerifyForm key={key} token={route.searchParams.get('token') || ''}/> : <Hub key={key} view={route.pathname === '/admin' ? 'admin' : route.pathname === '/my-events' ? 'mine' : 'events'}/>}</>;
}
createRoot(document.getElementById('root')!).render(<App/>);
