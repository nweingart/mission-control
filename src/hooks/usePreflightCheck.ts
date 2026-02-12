import { useState, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { ServiceKey } from '../constants/preflight-requirements';

export interface PreflightFailure {
  key: ServiceKey;
  installed: boolean;
  authenticated: boolean;
}

export type PreflightStatus = 'idle' | 'checking' | 'blocked' | 'passed';

export function usePreflightCheck(requiredServices: ServiceKey[]) {
  const { setCLIStatus } = useAppStore();
  const [status, setStatus] = useState<PreflightStatus>('idle');
  const [failures, setFailures] = useState<PreflightFailure[]>([]);
  const pendingOperationRef = useRef<(() => Promise<unknown>) | null>(null);
  const pendingResolveRef = useRef<((value: unknown) => void) | null>(null);
  const pendingRejectRef = useRef<((err: unknown) => void) | null>(null);

  const checkServices = useCallback(async (): Promise<PreflightFailure[]> => {
    const freshStatus = await window.api.cli.checkAll();
    setCLIStatus(freshStatus);

    const failed: PreflightFailure[] = [];
    for (const key of requiredServices) {
      const svc = freshStatus[key];
      if (!svc?.installed || !svc?.authenticated) {
        failed.push({
          key,
          installed: svc?.installed ?? false,
          authenticated: svc?.authenticated ?? false,
        });
      }
    }
    return failed;
  }, [requiredServices, setCLIStatus]);

  const runGuarded = useCallback(
    <T,>(operation: () => Promise<T>): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        setStatus('checking');

        checkServices()
          .then((failed) => {
            if (failed.length === 0) {
              setStatus('passed');
              setFailures([]);
              operation().then(resolve).catch(reject);
            } else {
              setStatus('blocked');
              setFailures(failed);
              pendingOperationRef.current = operation as () => Promise<unknown>;
              pendingResolveRef.current = resolve as (value: unknown) => void;
              pendingRejectRef.current = reject;
            }
          })
          .catch((err) => {
            // If the check itself fails, let the operation through
            console.warn('[usePreflightCheck] Check failed, proceeding:', err);
            setStatus('passed');
            operation().then(resolve).catch(reject);
          });
      });
    },
    [checkServices]
  );

  const retry = useCallback(async () => {
    setStatus('checking');
    try {
      const failed = await checkServices();
      if (failed.length === 0) {
        setStatus('passed');
        setFailures([]);
        if (pendingOperationRef.current && pendingResolveRef.current) {
          const op = pendingOperationRef.current;
          const resolve = pendingResolveRef.current;
          const reject = pendingRejectRef.current;
          pendingOperationRef.current = null;
          pendingResolveRef.current = null;
          pendingRejectRef.current = null;
          op().then(resolve).catch(reject);
        }
      } else {
        setStatus('blocked');
        setFailures(failed);
      }
    } catch (err) {
      console.warn('[usePreflightCheck] Retry check failed:', err);
      setStatus('blocked');
    }
  }, [checkServices]);

  const dismiss = useCallback(() => {
    setStatus('passed');
    setFailures([]);
    if (pendingOperationRef.current && pendingResolveRef.current) {
      const op = pendingOperationRef.current;
      const resolve = pendingResolveRef.current;
      const reject = pendingRejectRef.current;
      pendingOperationRef.current = null;
      pendingResolveRef.current = null;
      pendingRejectRef.current = null;
      op().then(resolve).catch(reject);
    }
  }, []);

  return { status, failures, runGuarded, retry, dismiss };
}
