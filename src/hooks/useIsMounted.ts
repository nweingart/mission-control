import { useEffect, useRef, useCallback } from 'react';

/**
 * Returns a ref that tracks whether the component is still mounted.
 * Use to guard async callbacks against state updates after unmount.
 */
export function useIsMounted() {
  const ref = useRef(true);

  useEffect(() => {
    ref.current = true;
    return () => {
      ref.current = false;
    };
  }, []);

  return ref;
}
