export default function CICDTestRunner({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-border w-[480px] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-lg font-sans font-semibold text-ink">CI/CD Test Runner</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink-secondary">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-8 text-center">
          <p className="text-ink-muted text-sm">CI/CD testing is not available in this version.</p>
        </div>
        <div className="px-5 py-4 border-t border-border flex justify-end">
          <button onClick={onClose} className="btn-solid px-4 py-2 text-sm">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
