import { useCallback, useRef, useState } from 'react';
import { useAgentSteps } from 'agent-native';
import type { ClaudeStreamEvent } from '../types/electron';
import {
  parseDiscoveryTag,
  parseScanCompleteTag,
  discoveryToCodeIssue,
  discoveryToFeature,
} from '../utils/scan-parser';
import type { ParsedDiscovery, ScanMeta } from '../utils/scan-parser';
import type { CodeIssue, FeatureModule, TechStack } from '../types';

export type DiscoveryStreamStatus = 'idle' | 'thinking' | 'acting' | 'complete' | 'error';

export interface DiscoveryResults {
  issues: CodeIssue[];
  features: FeatureModule[];
  techStack: TechStack | null;
  discoveries: ParsedDiscovery[];
  scanMeta: ScanMeta | null;
  fullText: string;
}

export interface UseDiscoveryStreamReturn {
  discoveries: ParsedDiscovery[];
  scanMeta: ScanMeta | null;
  agentStatus: DiscoveryStreamStatus;
  timelineProps: ReturnType<typeof useAgentSteps>['props'];
  subscribe: (chatId: string) => void;
  unsubscribe: () => void;
  reset: () => void;
  fullText: string;
  issues: CodeIssue[];
  features: FeatureModule[];
  techStack: TechStack | null;
  /** Read latest results from refs (safe to call after await in async functions) */
  getResults: () => DiscoveryResults;
}

export interface DiscoveryStreamOptions {
  /** Called immediately when a new issue is discovered during streaming */
  onIssueDiscovered?: (issue: CodeIssue) => void;
}

export function useDiscoveryStream(options?: DiscoveryStreamOptions): UseDiscoveryStreamReturn {
  const [discoveries, setDiscoveries] = useState<ParsedDiscovery[]>([]);
  const [scanMeta, setScanMeta] = useState<ScanMeta | null>(null);
  const [agentStatus, setAgentStatus] = useState<DiscoveryStreamStatus>('idle');
  const [fullText, setFullText] = useState('');
  const [issues, setIssues] = useState<CodeIssue[]>([]);
  const [features, setFeatures] = useState<FeatureModule[]>([]);
  const [techStack, setTechStack] = useState<TechStack | null>(null);

  // Stable ref for the callback to avoid re-creating handleStreamEvent
  const onIssueDiscoveredRef = useRef(options?.onIssueDiscovered);
  onIssueDiscoveredRef.current = options?.onIssueDiscovered;

  const { dispatch, props: timelineProps, reset: resetSteps } = useAgentSteps({
    showToolCalls: true,
  });

  const chatIdRef = useRef<string | null>(null);
  const textBufferRef = useRef('');
  const currentStepIdRef = useRef<string | null>(null);
  const discoveryIndexRef = useRef(0);
  const stepCounterRef = useRef(0);

  // Refs that mirror state — safe to read from async functions after await
  const issuesRef = useRef<CodeIssue[]>([]);
  const featuresRef = useRef<FeatureModule[]>([]);
  const techStackRef = useRef<TechStack | null>(null);
  const discoveriesRef = useRef<ParsedDiscovery[]>([]);
  const scanMetaRef = useRef<ScanMeta | null>(null);
  const fullTextRef = useRef('');

  const ensureStep = useCallback((label: string): string => {
    // Complete the previous step
    if (currentStepIdRef.current) {
      dispatch({
        type: 'step.completed',
        stepId: currentStepIdRef.current,
        status: 'complete',
      });
    }
    const id = `scan-step-${++stepCounterRef.current}`;
    currentStepIdRef.current = id;
    dispatch({
      type: 'step.started',
      step: { id, label, status: 'running' },
    });
    return id;
  }, [dispatch]);

  const handleStreamEvent = useCallback((event: ClaudeStreamEvent) => {
    // Guard against stale events arriving after unsubscribe
    if (!chatIdRef.current) return;

    switch (event.type) {
      case 'thinking': {
        setAgentStatus('thinking');
        if (event.content) {
          if (currentStepIdRef.current) {
            dispatch({
              type: 'step.updated',
              stepId: currentStepIdRef.current,
              fields: { description: event.content.slice(0, 200) },
            });
          } else {
            ensureStep('Analyzing codebase...');
          }
        }
        break;
      }

      case 'tool_use': {
        setAgentStatus('acting');
        const stepId = currentStepIdRef.current || ensureStep('Working...');

        let toolLabel = event.toolName || 'Tool';
        if (event.toolInput) {
          if (event.toolName === 'Read' && event.toolInput.file_path) {
            toolLabel = `Reading ${String(event.toolInput.file_path).split('/').slice(-2).join('/')}`;
          } else if (event.toolName === 'Grep' && event.toolInput.pattern) {
            toolLabel = `Searching for '${String(event.toolInput.pattern).slice(0, 40)}'`;
          } else if (event.toolName === 'Glob' && event.toolInput.pattern) {
            toolLabel = `Finding ${String(event.toolInput.pattern)}`;
          } else if (event.toolName === 'Bash' && event.toolInput.command) {
            toolLabel = `Running: ${String(event.toolInput.command).slice(0, 50)}`;
          } else if (event.toolName === 'Bash') {
            toolLabel = 'Running command';
          }
        }

        dispatch({
          type: 'tool.started',
          stepId,
          toolCall: {
            id: `tool-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            name: toolLabel,
            input: event.toolInput || {},
          },
        });
        break;
      }

      case 'text': {
        if (!event.content) break;
        setAgentStatus('acting');
        setFullText(prev => prev + event.content!);
        fullTextRef.current += event.content;
        textBufferRef.current += event.content;

        // Parse for <DISCOVERY> tags
        const discoveryRegex = /<DISCOVERY\s+type="[^"]+">[\s\S]*?<\/DISCOVERY>/g;
        let match: RegExpExecArray | null;
        while ((match = discoveryRegex.exec(textBufferRef.current)) !== null) {
          const parsed = parseDiscoveryTag(match[0]);
          if (parsed) {
            const idx = discoveryIndexRef.current++;
            const discovery: ParsedDiscovery = {
              type: parsed.type as ParsedDiscovery['type'],
              data: parsed.data,
              index: idx,
              timestamp: new Date().toISOString(),
            };

            setDiscoveries(prev => { const next = [...prev, discovery]; discoveriesRef.current = next; return next; });

            if (parsed.type === 'issue') {
              const issue = discoveryToCodeIssue(parsed.data, idx);
              setIssues(prev => { const next = [...prev, issue]; issuesRef.current = next; return next; });
              // Fire callback immediately so callers can act on the issue (e.g. auto-triage)
              onIssueDiscoveredRef.current?.(issue);
            } else if (parsed.type === 'techStack') {
              const ts = {
                languages: (parsed.data.languages as string[]) || [],
                frameworks: (parsed.data.frameworks as string[]) || [],
                buildTools: (parsed.data.buildTools as string[]) || [],
                summary: String(parsed.data.summary || 'Unknown stack'),
              };
              techStackRef.current = ts;
              setTechStack(ts);
            } else if (parsed.type === 'feature') {
              const feat = discoveryToFeature(parsed.data, idx);
              setFeatures(prev => { const next = [...prev, feat]; featuresRef.current = next; return next; });
            }

            ensureStep('Continuing analysis...');
          }

          // Remove parsed content from buffer to prevent re-matching
          textBufferRef.current = textBufferRef.current.slice(match.index + match[0].length);
          discoveryRegex.lastIndex = 0;
        }

        // Parse for <SCAN_COMPLETE> tag
        const completeMatch = textBufferRef.current.match(/<SCAN_COMPLETE>[\s\S]*?<\/SCAN_COMPLETE>/);
        if (completeMatch) {
          const meta = parseScanCompleteTag(completeMatch[0]);
          if (meta) {
            scanMetaRef.current = meta;
            setScanMeta(meta);
          }
          textBufferRef.current = textBufferRef.current.slice(
            completeMatch.index! + completeMatch[0].length
          );
        }

        // Use narration text as step labels
        const cleanBuffer = textBufferRef.current
          .replace(/<DISCOVERY[\s\S]*$/m, '')
          .replace(/<SCAN_COMPLETE[\s\S]*$/m, '')
          .trim();

        if (cleanBuffer.length > 10 && currentStepIdRef.current) {
          const lines = cleanBuffer.split('\n').filter(l => l.trim().length > 5);
          const lastLine = lines[lines.length - 1]?.trim();
          if (lastLine && lastLine.length > 5 && lastLine.length < 120) {
            dispatch({
              type: 'step.updated',
              stepId: currentStepIdRef.current,
              fields: { label: lastLine.replace(/^[-*•]\s*/, '') },
            });
          }
        }

        // Trim buffer to prevent unbounded growth — but never cut inside a tag
        if (textBufferRef.current.length > 4000) {
          // Find the last potential tag opening so we don't slice it in half
          const lastTagOpen = textBufferRef.current.lastIndexOf('<');
          const safeSlicePoint = lastTagOpen > 0 ? lastTagOpen : textBufferRef.current.length - 2000;
          // Keep everything from safeSlicePoint onward (preserves any partial tag)
          textBufferRef.current = textBufferRef.current.slice(Math.max(0, safeSlicePoint));
        }
        break;
      }

      case 'done': {
        setAgentStatus('complete');
        if (currentStepIdRef.current) {
          dispatch({
            type: 'step.completed',
            stepId: currentStepIdRef.current,
            status: 'complete',
          });
          currentStepIdRef.current = null;
        }
        break;
      }

      case 'error': {
        setAgentStatus('error');
        if (currentStepIdRef.current) {
          dispatch({
            type: 'step.completed',
            stepId: currentStepIdRef.current,
            status: 'error',
            error: event.content || 'Unknown error',
          });
          currentStepIdRef.current = null;
        }
        break;
      }
    }
  }, [dispatch, ensureStep]);

  const subscribe = useCallback((chatId: string) => {
    // Unsubscribe any previous listener
    if (chatIdRef.current) {
      window.api.claude.offStreamEventForTask(chatIdRef.current);
    }
    // Reset accumulated state so new scan doesn't append to old data
    textBufferRef.current = '';
    currentStepIdRef.current = null;
    discoveryIndexRef.current = 0;
    stepCounterRef.current = 0;
    issuesRef.current = [];
    featuresRef.current = [];
    techStackRef.current = null;
    discoveriesRef.current = [];
    scanMetaRef.current = null;
    fullTextRef.current = '';
    setDiscoveries([]);
    setScanMeta(null);
    setFullText('');
    setIssues([]);
    setFeatures([]);
    setTechStack(null);
    resetSteps();

    chatIdRef.current = chatId;
    setAgentStatus('thinking');
    ensureStep('Starting scan...');
    window.api.claude.onStreamEventForTask(chatId, handleStreamEvent);
  }, [handleStreamEvent, ensureStep, resetSteps]);

  const unsubscribe = useCallback(() => {
    if (chatIdRef.current) {
      window.api.claude.offStreamEventForTask(chatIdRef.current);
      chatIdRef.current = null;
    }
  }, []);

  const getResults = useCallback((): DiscoveryResults => ({
    issues: issuesRef.current,
    features: featuresRef.current,
    techStack: techStackRef.current,
    discoveries: discoveriesRef.current,
    scanMeta: scanMetaRef.current,
    fullText: fullTextRef.current,
  }), []);

  const reset = useCallback(() => {
    unsubscribe();
    setDiscoveries([]);
    setScanMeta(null);
    setAgentStatus('idle');
    setFullText('');
    setIssues([]);
    setFeatures([]);
    setTechStack(null);
    textBufferRef.current = '';
    currentStepIdRef.current = null;
    discoveryIndexRef.current = 0;
    stepCounterRef.current = 0;
    issuesRef.current = [];
    featuresRef.current = [];
    techStackRef.current = null;
    discoveriesRef.current = [];
    scanMetaRef.current = null;
    fullTextRef.current = '';
    resetSteps();
  }, [unsubscribe, resetSteps]);

  return {
    discoveries,
    scanMeta,
    agentStatus,
    timelineProps,
    subscribe,
    unsubscribe,
    reset,
    fullText,
    issues,
    features,
    techStack,
    getResults,
  };
}
