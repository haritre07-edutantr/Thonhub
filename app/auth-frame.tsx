'use client';
import type { ReactNode } from 'react';
export default function AuthFrame({ children }: { children: ReactNode }) {
  return <div className="site-shell"><header><div className="nav-wrap"><a href="/" className="brand"><img src="/thonhub-logo.png" alt="Thon Hub"/><span>POWERED BY <b>EDUTANTR</b></span></a><nav><a href="/">Explore events</a><a href="/my-events">My events</a></nav></div></header><main className="auth-main">{children}</main><footer><a href="/" className="footer-word">Thon<span>hub</span></a><span>Powered by <b>Edutantr</b></span><span>Learn. Build. Connect.</span></footer></div>;
}
