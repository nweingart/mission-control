import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

const UPGRADE_URL = 'https://gethouston.dev/pro';

interface PaywallModalProps {
  onDismiss: () => void;
  onUpgradeComplete: () => void;
}

export default function PaywallModal({ onDismiss, onUpgradeComplete }: PaywallModalProps) {
  const authUser = useAppStore(s => s.authUser);
  const subscriptionStatus = useAppStore(s => s.subscriptionStatus);
  const checkSubscription = useAppStore(s => s.checkSubscription);
  const [isChecking, setIsChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const features = [
    'Unlimited projects',
    'Priority support',
    'Early access to new features',
  ];

  const handleUpgrade = async () => {
    await window.api.shell.openExternal(UPGRADE_URL);
  };

  const handleAlreadyUpgraded = async () => {
    setIsChecking(true);
    setCheckError(null);
    try {
      await checkSubscription();
      // checkSubscription updates the store — if active, the effect below will auto-dismiss
      const { subscriptionStatus: status } = useAppStore.getState();
      if (status !== 'active') {
        setCheckError('No active subscription found. Complete checkout on the website first.');
      }
    } catch {
      setCheckError('Could not verify subscription. Make sure you completed checkout on the website.');
    } finally {
      setIsChecking(false);
    }
  };

  // Auto-dismiss if subscription becomes active (e.g., deep link callback)
  if (authUser && subscriptionStatus === 'active') {
    onUpgradeComplete();
    return null;
  }

  return (
    <div className="absolute inset-0 z-50 bg-surface-light/80 backdrop-blur-sm flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="paywall-heading">
      <div className="card-panel p-8 max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 bg-accent/15 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.13 22.19L11.5 18.36C13.07 17.78 14.54 17 15.9 16.09L13.13 22.19M5.64 12.5L1.81 10.87L7.91 8.1C7 9.46 6.22 10.93 5.64 12.5M21.61 2.39C21.61 2.39 16.66 .269 11 5.93C8.81 8.12 7.5 10.53 6.65 12.64C6.37 13.39 6.56 14.21 7.11 14.77L9.24 16.89C9.79 17.45 10.61 17.63 11.36 17.35C13.5 16.53 15.88 15.19 18.07 13C23.73 7.34 21.61 2.39 21.61 2.39M14.54 9.46C13.76 8.68 13.76 7.41 14.54 6.63S16.59 5.85 17.37 6.63C18.14 7.41 18.15 8.68 17.37 9.46C16.59 10.24 15.32 10.24 14.54 9.46Z" />
            </svg>
          </div>
          <h2 id="paywall-heading" className="text-lg font-sans font-semibold text-ink">Upgrade to Mission Control Pro</h2>
          <p className="text-2xl font-display font-bold text-accent mt-2">$8/month</p>
        </div>

        {/* Features */}
        <div className="space-y-3 mb-8">
          {features.map((feature) => (
            <div key={feature} className="flex items-center space-x-3">
              <svg className="w-5 h-5 text-success flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-ink">{feature}</span>
            </div>
          ))}
        </div>

        {/* Error message */}
        {checkError && (
          <div className="mb-4 px-3 py-2 bg-error/10 border border-error/20 text-sm text-error text-center">
            {checkError}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleUpgrade}
            className="btn-solid-primary w-full py-3 text-center flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Upgrade to Pro
          </button>
          <button
            onClick={handleAlreadyUpgraded}
            disabled={isChecking}
            className="text-sm text-accent hover:text-accent-hover transition-colors text-center flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isChecking && <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent animate-spin" />}
            I already upgraded
          </button>
          <button
            onClick={onDismiss}
            className="text-sm text-ink-muted hover:text-ink-secondary transition-colors text-center"
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
