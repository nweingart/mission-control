import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { STEP_REQUIREMENTS, type ServiceKey } from '../constants/preflight-requirements';
import type { Screen } from '../types';

const POLL_INTERVAL = 30_000; // 30 seconds

// Screens where we don't need to poll (they handle their own CLI setup)
const EXEMPT_SCREENS = new Set(['onboarding']);

// Screens that have their own PreflightGateOverlay — don't block globally
const PREFLIGHT_GATE_SCREENS = new Set<Screen>(['building', 'deploying', 'prd-review']);

// V2 screens that don't require any CLI tools (read-only views, local-only operations)
const NO_CLI_SCREENS = new Set<Screen>([
  'home', 'import', 'project-home', 'docs', 'issues', 'settings',
  'git-history', 'deployments', 'planning', 'planning-chats',
]);

// Map screen names to STEP_REQUIREMENTS keys
const SCREEN_TO_STEP: Partial<Record<Screen, string>> = {
  discovery: 'discovery',
  'prd-review': 'prd-review',
  building: 'building',
  deploying: 'deploying',
};

export function useCLIMonitor() {
  const screen = useAppStore(s => s.screen);
  const cliStatus = useAppStore(s => s.cliStatus);
  const setCLIStatus = useAppStore(s => s.setCLIStatus);
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

  // Derive which services are required for the current screen
  const stepKey = SCREEN_TO_STEP[screen];
  const requiredServices: ServiceKey[] = NO_CLI_SCREENS.has(screen)
    ? []
    : stepKey ? (STEP_REQUIREMENTS[stepKey] || []) : ['claude', 'github'];

  // Check only required services
  const requiredConnected = cliStatus
    ? requiredServices.every(
        (key) => cliStatus[key]?.installed && cliStatus[key]?.authenticated
      )
    : true; // Don't block while status is null (initial load)

  // Don't block on screens that handle their own preflight gate
  const shouldBlock =
    !EXEMPT_SCREENS.has(screen) &&
    !PREFLIGHT_GATE_SCREENS.has(screen as Screen) &&
    !requiredConnected &&
    cliStatus !== null;

  return { allConnected: requiredConnected, shouldBlock };
}
