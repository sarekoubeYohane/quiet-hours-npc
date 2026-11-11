import Link from 'next/link';
import type { ReactNode } from 'react';
import { Moon } from 'lucide-react';
import type { EnvironmentView } from '@/lib/environment';

/** One header for every signed-in page outside the observation room, which keeps its own for in-place view switching. */
export default function SiteHeader({ subtitle = 'NPC 觀察室', environment, displayName, children }: {
  subtitle?: string; environment?: EnvironmentView; displayName?: string; children?: ReactNode;
}) {
  const built = environment && environment.builtAtLabel !== 'unknown' ? ` · 建置於 ${environment.builtAtLabel}` : '';
  return <header className="topbar site-header">
    <Link href="/" className="brand"><span className="brand-mark"><Moon size={21}/></span><span>Quiet Hours<small>{subtitle}</small></span></Link>
    <div className="header-right">
      {children}
      {environment && <span className="environment-badge" title={`目前環境與建置的提交短碼${built}`}>{environment.caption}</span>}
      {displayName && <><span className="edition">{displayName} · 已登入</span>
        <form method="post" action="/api/auth/logout"><button type="submit" className="header-logout">登出</button></form></>}
    </div>
  </header>;
}
