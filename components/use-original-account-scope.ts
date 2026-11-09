'use client';
import { useCallback, useRef, useState } from 'react';
import { accountScopeMismatch } from '@/lib/account-scope';
/** An editor retains the identity of its first read, including while cookies change. */
export function useOriginalAccountScope(initial?: string) {
  const original = useRef(initial);
  const [accountScope, setAccountScope] = useState(initial);
  const capture = useCallback((incoming: unknown): string => {
    if (typeof incoming !== 'string' || !incoming || (original.current && original.current !== incoming)) throw Error(accountScopeMismatch.error);
    if (!original.current) { original.current = incoming; setAccountScope(incoming); }
    return incoming;
  }, []);
  const scoped = useCallback((path: string, parameter = 'accountScope'): string => original.current ? path + (path.includes('?') ? '&' : '?') + parameter + '=' + encodeURIComponent(original.current) : path, []);
  return { accountScope, capture, scoped };
}
