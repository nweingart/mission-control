import { createContext, useContext, type ReactNode } from 'react';
import { useBuildPipeline } from './useBuildPipeline';

export type BuildPipelineReturn = ReturnType<typeof useBuildPipeline>;

const BuildPipelineCtx = createContext<BuildPipelineReturn | null>(null);

/**
 * Provides the build pipeline to all children.
 * Mount this in ProjectLayout so the pipeline lives independently of BuildScreen.
 */
export function BuildPipelineProvider({ children }: { children: ReactNode }) {
  const pipeline = useBuildPipeline();
  return (
    <BuildPipelineCtx.Provider value={pipeline}>
      {children}
    </BuildPipelineCtx.Provider>
  );
}

/**
 * Consume the build pipeline from any component inside a ProjectLayout.
 * Throws if used outside the provider.
 */
export function useBuildPipelineContext(): BuildPipelineReturn {
  const ctx = useContext(BuildPipelineCtx);
  if (!ctx) throw new Error('useBuildPipelineContext must be used inside BuildPipelineProvider');
  return ctx;
}
