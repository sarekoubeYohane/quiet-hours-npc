'use client';
import { useEffect, useRef } from 'react';

/** Flush debounced drafts before following links; failed writes keep the editor open. */
export function useDraftNavigation(pending: boolean, save: () => Promise<boolean>) {
  const latest = useRef({ pending, save });
  latest.current = { pending, save };
  useEffect(() => {
    let leaving = false;
    const unload = (event: BeforeUnloadEvent) => { if (latest.current.pending) { event.preventDefault(); event.returnValue = ''; } };
    const navigate = async (event: MouseEvent) => {
      if (!latest.current.pending || event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target || link.download || link.href === location.href || new URL(link.href).origin !== location.origin) return;
      event.preventDefault(); event.stopPropagation();
      if (leaving) return;
      leaving = true;
      try { if (await latest.current.save()) { latest.current.pending = false; location.assign(link.href); } }
      finally { leaving = false; }
    };
    document.addEventListener('click', navigate, true); window.addEventListener('beforeunload', unload);
    return () => { document.removeEventListener('click', navigate, true); window.removeEventListener('beforeunload', unload); };
  }, []);
}
