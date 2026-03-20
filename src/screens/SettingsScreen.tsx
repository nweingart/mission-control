import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import type { AgentRoleConfig, AgentProvider } from '../types';

export default function SettingsScreen() {
  const setScreen = useAppStore(s => s.setScreen);
  const resetOnboarding = useAppStore(s => s.resetOnboarding);
  const authUser = useAppStore(s => s.authUser);
  const subscriptionStatus = useAppStore(s => s.subscriptionStatus);
  const signOut = useAppStore(s => s.signOut);
  const [isManaging, setIsManaging] = useState(false);

  // Multi-agent mode state
  const [multiAgentEnabled, setMultiAgentEnabled] = useState(false);
  const [agentRoles, setAgentRoles] = useState<AgentRoleConfig>({ builder: 'claude', reviewer: 'claude' });
  const [codexStatus, setCodexStatus] = useState<{ installed: boolean; authenticated: boolean } | null>(null);
  const [codexChecking, setCodexChecking] = useState(false);

  // Build behavior state
  const [pauseBetweenTiers, setPauseBetweenTiers] = useState(false);

  useEffect(() => {
    window.api.storage.getConfig().then((config) => {
      setMultiAgentEnabled(config.multiAgentEnabled ?? false);
      setAgentRoles(config.agentRoles ?? { builder: 'claude', reviewer: 'claude' });
      setPauseBetweenTiers(config.pauseBetweenTiers ?? false);
    });
    // Fast check (--version) for initial display
    window.api.cli.checkCodex().then(setCodexStatus);
  }, []);

  const handleDeepCheckCodex = async () => {
    setCodexChecking(true);
    try {
      const result = await window.api.cli.checkCodexDeep();
      setCodexStatus(result);
    } finally {
      setCodexChecking(false);
    }
  };

  const saveMultiAgentConfig = async (enabled: boolean, roles: AgentRoleConfig) => {
    const config = await window.api.storage.getConfig();
    await window.api.storage.saveConfig({ ...config, multiAgentEnabled: enabled, agentRoles: roles });
  };

  const handleToggleMultiAgent = async () => {
    const newEnabled = !multiAgentEnabled;
    setMultiAgentEnabled(newEnabled);
    await saveMultiAgentConfig(newEnabled, agentRoles);
  };

  const handleRoleChange = async (role: 'builder' | 'reviewer', provider: AgentProvider) => {
    const newRoles = { ...agentRoles, [role]: provider };
    setAgentRoles(newRoles);
    await saveMultiAgentConfig(multiAgentEnabled, newRoles);
  };

  const handleTogglePauseBetweenTiers = async () => {
    const newValue = !pauseBetweenTiers;
    setPauseBetweenTiers(newValue);
    const config = await window.api.storage.getConfig();
    await window.api.storage.saveConfig({ ...config, pauseBetweenTiers: newValue });
  };

  const handleResetOnboarding = () => {
    if (window.confirm('Reset onboarding walkthrough? You will see the intro screens again.')) {
      resetOnboarding();
    }
  };

  const handleManageSubscription = async () => {
    setIsManaging(true);
    try {
      console.log('Subscription management not available in this version');
    } finally {
      setIsManaging(false);
    }
  };

  const handleSignOut = async () => {
    if (window.confirm('Sign out of Mission Control Pro?')) {
      await signOut();
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-3 drag-region flex items-center gap-3 header-with-traffic-lights">
        <button
          onClick={() => setScreen('home')}
          className="no-drag text-ink-muted hover:text-ink transition-colors"
          title="Back to Home"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="font-display text-lg tracking-wide font-bold text-secondary">Settings</h1>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-lg mx-auto space-y-6">
          {/* Account & Subscription */}
          <section className="card-panel p-5 space-y-1">
            <h2 className="text-sm font-semibold text-ink mb-3">Account</h2>
            {authUser ? (
              <>
                <div className="px-3 py-2.5 text-sm text-ink flex items-center justify-between">
                  <span>{authUser.username || authUser.email}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 ${
                    subscriptionStatus === 'active'
                      ? 'bg-success/15 text-success'
                      : 'bg-ink-muted/15 text-ink-muted'
                  }`}>
                    {subscriptionStatus === 'active' ? 'Pro' : 'Free'}
                  </span>
                </div>
                {subscriptionStatus === 'active' && (
                  <button
                    onClick={handleManageSubscription}
                    disabled={isManaging}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-hover transition-colors flex items-center justify-between disabled:opacity-50"
                  >
                    {isManaging ? 'Opening...' : 'Manage Subscription'}
                    <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-ink-muted hover:text-error hover:bg-surface-hover transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <div className="px-3 py-2.5 text-sm text-ink-muted">
                Not signed in
              </div>
            )}
          </section>

          {/* Navigation shortcuts */}
          <section className="card-panel p-5 space-y-1">
            <h2 className="text-sm font-semibold text-ink mb-3">Configuration</h2>
            <button
              onClick={() => setScreen('onboarding')}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-hover transition-colors flex items-center justify-between"
            >
              Manage Tools
              <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={() => setScreen('onboarding')}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-hover transition-colors flex items-center justify-between"
            >
              Workspace Directory
              <svg className="w-4 h-4 text-ink-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              onClick={handleResetOnboarding}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-hover transition-colors"
            >
              Reset Onboarding
            </button>
          </section>

          {/* Build Behavior */}
          <section className="card-panel p-5 space-y-3">
            <h2 className="text-sm font-semibold text-ink mb-3">Build Behavior</h2>
            <div className="flex items-center justify-between px-3 py-2.5">
              <div>
                <div className="text-sm text-ink">Pause Between Build Tiers</div>
                <div className="text-xs text-ink-muted mt-0.5">When enabled, builds pause after each tier for manual review</div>
              </div>
              <button
                onClick={handleTogglePauseBetweenTiers}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  pauseBetweenTiers ? 'bg-accent' : 'bg-ink-muted/30'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    pauseBetweenTiers ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Multi-Agent Mode */}
          <section className="card-panel p-5 space-y-3">
            <h2 className="text-sm font-semibold text-ink mb-3">Multi-Agent Mode</h2>
            <div className="flex items-center justify-between px-3 py-2.5">
              <div>
                <div className="text-sm text-ink">Enable Multi-Agent Mode</div>
                <div className="text-xs text-ink-muted mt-0.5">Route build and review phases to different AI agents</div>
              </div>
              <button
                onClick={handleToggleMultiAgent}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  multiAgentEnabled ? 'bg-accent' : 'bg-ink-muted/30'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                    multiAgentEnabled ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>

            {multiAgentEnabled && (
              <>
                {codexStatus && !codexStatus.installed && (
                  <div className="mx-3 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20 text-xs text-warning">
                    Codex CLI is not installed. Run: <code className="font-mono">npm install -g @openai/codex</code>
                  </div>
                )}
                {codexStatus && codexStatus.installed && !codexStatus.authenticated && (
                  <div className="mx-3 px-3 py-2 rounded-lg bg-warning/10 border border-warning/20 text-xs text-warning">
                    Codex CLI is installed but not authenticated. Run: <code className="font-mono">codex login</code>
                  </div>
                )}

                <div className="px-3 space-y-2">
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-ink">Builder (writes code)</span>
                    <select
                      value={agentRoles.builder}
                      onChange={(e) => handleRoleChange('builder', e.target.value as AgentProvider)}
                      className="text-sm bg-surface border border-border rounded px-2 py-1 text-ink"
                    >
                      <option value="claude">Claude</option>
                      <option value="codex">Codex</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-ink">Reviewer (reviews + fixes)</span>
                    <select
                      value={agentRoles.reviewer}
                      onChange={(e) => handleRoleChange('reviewer', e.target.value as AgentProvider)}
                      className="text-sm bg-surface border border-border rounded px-2 py-1 text-ink"
                    >
                      <option value="claude">Claude</option>
                      <option value="codex">Codex</option>
                    </select>
                  </div>
                </div>

                <div className="px-3 flex items-center justify-between py-2">
                  <span className="text-xs text-ink-muted">
                    Config is read when a build starts. Changes take effect on the next build.
                  </span>
                  <button
                    onClick={handleDeepCheckCodex}
                    disabled={codexChecking}
                    className="text-xs text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
                  >
                    {codexChecking ? 'Checking...' : 'Verify Codex'}
                  </button>
                </div>
              </>
            )}
          </section>

          {/* Debug / Test */}
          <section className="card-panel p-5 space-y-1">
            <h2 className="text-sm font-semibold text-ink mb-3">Debug</h2>
            <button
              onClick={() => window.openFlowTest?.()}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-hover transition-colors"
            >
              Run Flow Test
            </button>
            <button
              onClick={() => window.openE2ETest?.()}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-hover transition-colors"
            >
              Run E2E Test
            </button>
            <button
              onClick={() => window.openCICDTest?.()}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-ink hover:bg-surface-hover transition-colors"
            >
              Run CI/CD Test
            </button>
          </section>
        </div>
      </main>
    </div>
  );
}
