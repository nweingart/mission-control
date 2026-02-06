import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

const POLL_INTERVAL = 30_000; // 30 seconds

// Screens where we don't need to poll (they handle their own CLI setup)
const EXEMPT_SCREENS = new Set(['onboarding', 'setup-workspace', 'setup-deploy']);

export function useCLIMonitor() {
  const { screen, cliStatus, setCLIStatus } = useAppStore();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    // Don't poll on setup/onboarding screens
    if (EXEMPT_SCREENS.has(screen)) {
      return;
    }

    const poll = async () => {
      try {
        const status = await window.api.cli.checkAll();
        setCLIStatus(status);
      } catch (err) {
        console.error('CLI status poll failed:', err);
      }
    };

    // Poll immediately on screen change, then every 30s
    poll();
    intervalRef.current = setInterval(poll, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [screen, setCLIStatus]);

  // Derive disconnection info from store cliStatus
  const allConnected = cliStatus
    ? cliStatus.claude.installed && cliStatus.claude.authenticated &&
      cliStatus.github.installed && cliStatus.github.authenticated &&
      cliStatus.vercel.installed && cliStatus.vercel.authenticated &&
      cliStatus.supabase.installed && cliStatus.supabase.authenticated
    : true; // Don't block while status is null (initial load)

  const shouldBlock = !EXEMPT_SCREENS.has(screen) && !allConnected && cliStatus !== null;

  return { allConnected, shouldBlock };
}
