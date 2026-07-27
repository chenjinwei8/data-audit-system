import { useCallback, useRef, useState } from 'react';

export default function useActionState() {
  const pendingRef = useRef<string | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const run = useCallback(async <T,>(key: string, action: () => Promise<T>) => {
    if (pendingRef.current !== null) return undefined;
    pendingRef.current = key;
    setPendingKey(key);
    try {
      return await action();
    } finally {
      pendingRef.current = null;
      setPendingKey(null);
    }
  }, []);

  return {
    pendingKey,
    isPending: (key?: string) => key ? pendingKey === key : pendingKey !== null,
    run,
  };
}

