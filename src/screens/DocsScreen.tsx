import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useProjectStore } from '../store/ProjectStoreContext';
import type { FeatureModule } from '../types';

export default function DocsScreen() {
  const currentProject = useProjectStore(s => s.currentProject);
  const [masterPrd, setMasterPrd] = useState<string | null>(null);
  const [features, setFeatures] = useState<FeatureModule[]>([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [editingMasterPrd, setEditingMasterPrd] = useState(false);
  const [editingFeatureId, setEditingFeatureId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    if (!currentProject) return;
    window.api.storage.getPRD(currentProject.slug).then(setMasterPrd).catch(() => setMasterPrd(null));
    window.api.storage.getFeatures(currentProject.slug).then(setFeatures).catch(() => setFeatures([]));
  }, [currentProject]);

  if (!currentProject) return null;

  const selectedFeature = features.find(f => f.id === selectedFeatureId);

  const handleSaveMasterPrd = async () => {
    await window.api.storage.savePRD(currentProject.slug, editText);
    setMasterPrd(editText);
    setEditingMasterPrd(false);
  };

  const handleSaveFeaturePrd = async (featureId: string) => {
    const updated = features.map(f =>
      f.id === featureId ? { ...f, prd: editText, prdEditedByUser: true, lastUpdated: new Date().toISOString() } : f
    );
    await window.api.storage.saveFeatures(currentProject.slug, updated);
    setFeatures(updated);
    setEditingFeatureId(null);
  };

  const renderMarkdown = (content: string) => (
    <div className="prose prose-sm max-w-none prose-headings:text-ink prose-p:text-ink-secondary prose-strong:text-ink prose-li:text-ink-secondary prose-code:text-xs prose-code:bg-surface-light prose-code:border prose-code:border-border prose-code:px-1 prose-pre:bg-surface-light prose-pre:border prose-pre:border-border">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );

  // Feature detail view
  if (selectedFeature) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => { setSelectedFeatureId(null); setEditingFeatureId(null); }}
            className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-6"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Docs
          </button>

          <div className="card-panel">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-ink">{selectedFeature.name}</h2>
                <p className="text-sm text-ink-muted mt-0.5">{selectedFeature.description}</p>
              </div>
              {editingFeatureId !== selectedFeature.id ? (
                <button
                  onClick={() => { setEditingFeatureId(selectedFeature.id); setEditText(selectedFeature.prd); }}
                  className="text-xs text-accent hover:text-accent/80 font-medium"
                >
                  Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingFeatureId(null)}
                    className="text-xs text-ink-muted hover:text-ink"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSaveFeaturePrd(selectedFeature.id)}
                    className="text-xs text-accent hover:text-accent/80 font-medium"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>

            {/* Proposed PRD update banner */}
            {selectedFeature.proposedPrd && editingFeatureId !== selectedFeature.id && (
              <div className="mx-6 mt-4 p-3 bg-warning/10 border border-warning/20 flex items-center justify-between">
                <p className="text-xs text-warning">A newer version of this documentation was generated during the last re-scan.</p>
                <div className="flex gap-2 flex-shrink-0 ml-3">
                  <button
                    onClick={async () => {
                      const updated = features.map(f =>
                        f.id === selectedFeature.id ? { ...f, prd: f.proposedPrd!, proposedPrd: undefined } : f
                      );
                      await window.api.storage.saveFeatures(currentProject!.slug, updated);
                      setFeatures(updated);
                    }}
                    className="text-xs text-accent hover:text-accent/80 font-medium"
                  >
                    Accept Update
                  </button>
                  <button
                    onClick={async () => {
                      const updated = features.map(f =>
                        f.id === selectedFeature.id ? { ...f, proposedPrd: undefined } : f
                      );
                      await window.api.storage.saveFeatures(currentProject!.slug, updated);
                      setFeatures(updated);
                    }}
                    className="text-xs text-ink-muted hover:text-ink"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <div className="p-6">
              {editingFeatureId === selectedFeature.id ? (
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full h-96 bg-surface border border-border p-4 text-sm text-ink font-mono resize-y focus:outline-none focus:border-accent"
                />
              ) : (
                renderMarkdown(selectedFeature.prd || 'No documentation yet.')
              )}
            </div>

            {/* Files list */}
            {selectedFeature.files.length > 0 && (
              <div className="px-6 py-4 border-t border-border">
                <h3 className="text-xs font-display uppercase tracking-wider text-ink-muted mb-2">Key Files</h3>
                <div className="flex flex-wrap gap-1.5">
                  {selectedFeature.files.map((file, i) => (
                    <span key={i} className="px-2 py-0.5 text-xs bg-surface-light border border-border text-ink-muted font-mono">
                      {file}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main docs list view
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Master PRD */}
        <div className="card-panel">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-ink">Master PRD</h2>
              <p className="text-xs text-ink-muted mt-0.5">High-level product documentation</p>
            </div>
            {!editingMasterPrd ? (
              <button
                onClick={() => { setEditingMasterPrd(true); setEditText(masterPrd || ''); }}
                className="text-xs text-accent hover:text-accent/80 font-medium"
                disabled={!masterPrd}
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingMasterPrd(false)}
                  className="text-xs text-ink-muted hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMasterPrd}
                  className="text-xs text-accent hover:text-accent/80 font-medium"
                >
                  Save
                </button>
              </div>
            )}
          </div>
          <div className="p-6">
            {editingMasterPrd ? (
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full h-96 bg-surface border border-border p-4 text-sm text-ink font-mono resize-y focus:outline-none focus:border-accent"
              />
            ) : masterPrd ? (
              renderMarkdown(masterPrd)
            ) : (
              <p className="text-sm text-ink-muted italic">No master PRD yet. Run a scan to generate one.</p>
            )}
          </div>
        </div>

        {/* Feature PRDs */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-ink">Feature Documentation</h2>
            <span className="text-xs text-ink-muted">{features.length} features</span>
          </div>

          {features.length === 0 ? (
            <div className="card-panel p-8 text-center">
              <p className="text-sm text-ink-muted">No features documented yet. Run a scan to discover features.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {features.map((feature) => (
                <button
                  key={feature.id}
                  onClick={() => setSelectedFeatureId(feature.id)}
                  className="w-full card-panel p-4 text-left hover:border-accent/30 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-ink">{feature.name}</h3>
                        {feature.prdEditedByUser && (
                          <span className="px-1.5 py-0.5 text-[10px] bg-accent/10 text-accent border border-accent/20">edited</span>
                        )}
                        {feature.proposedPrd && (
                          <span className="px-1.5 py-0.5 text-[10px] bg-accent/10 text-accent border border-accent/20">update available</span>
                        )}
                        {feature.status === 'outdated' && (
                          <span className="px-1.5 py-0.5 text-[10px] bg-warning/10 text-warning border border-warning/20">outdated</span>
                        )}
                      </div>
                      <p className="text-xs text-ink-muted mt-1 line-clamp-2">{feature.description}</p>
                    </div>
                    <svg className="w-4 h-4 text-ink-muted flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-[10px] text-ink-muted">{feature.files.length} files</span>
                    <span className="text-[10px] text-ink-muted">Updated {new Date(feature.lastUpdated).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
