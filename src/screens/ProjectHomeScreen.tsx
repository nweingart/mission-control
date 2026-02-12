import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useAppStore } from '../store/useAppStore';
import GitHistoryScreen from './GitHistoryScreen';
import DeploymentsScreen from './DeploymentsScreen';
import DatabaseScreen from './DatabaseScreen';
import type { ProjectStatus, BacklogItem, Sprint, PlanningType } from '../types';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import houstonAvatar from '../assets/houston-avatar.webp';


const statusLabel: Record<ProjectStatus, string> = {
  idea: 'Idea',
  discovery: 'Discovery',
  prd_review: 'PRD Review',
  planning: 'Planning',
  building: 'Building',
  previewing: 'Preview',
  deploying: 'Deploying',
  complete: 'Complete',
};

const statusColor: Record<ProjectStatus, string> = {
  idea: 'bg-spectrum-blue/20 text-spectrum-blue',
  discovery: 'bg-spectrum-purple/20 text-spectrum-purple',
  prd_review: 'bg-spectrum-purple/20 text-spectrum-purple',
  planning: 'bg-spectrum-yellow/20 text-spectrum-yellow',
  building: 'bg-spectrum-orange/20 text-spectrum-orange',
  previewing: 'bg-spectrum-green/20 text-spectrum-green',
  deploying: 'bg-spectrum-blue/20 text-spectrum-blue',
  complete: 'bg-spectrum-green/20 text-spectrum-green',
};


type Tab = 'plan' | 'docs' | 'ship' | 'data' | 'settings';

type BacklogStatus = 'todo' | 'in_progress' | 'done';

const statusBadgeColors: Record<BacklogStatus, string> = {
  todo: 'bg-surface-light text-ink-muted border-border',
  in_progress: 'bg-spectrum-orange/20 text-spectrum-orange border-spectrum-orange/30',
  done: 'bg-spectrum-blue/20 text-spectrum-blue border-spectrum-blue/30',
};

const statusBadgeLabels: Record<BacklogStatus, string> = {
  todo: 'Queued',
  in_progress: 'In Orbit',
  done: 'Landed',
};

const nextStatus: Record<BacklogStatus, BacklogStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
};

const priorityColors: Record<string, string> = {
  high: 'bg-spectrum-orange/15 text-spectrum-orange border-spectrum-orange/30',
  medium: 'bg-spectrum-yellow/15 text-spectrum-yellow border-spectrum-yellow/30',
  low: 'bg-spectrum-blue/15 text-spectrum-blue border-spectrum-blue/30',
};


const typeColors: Record<PlanningType, string> = {
  bug_fix: 'bg-spectrum-orange/20 text-spectrum-orange border-spectrum-orange/30',
  feature_refactor: 'bg-spectrum-blue/20 text-spectrum-blue border-spectrum-blue/30',
  new_feature: 'bg-spectrum-purple/20 text-spectrum-purple border-spectrum-purple/30',
};
const typeLabels: Record<PlanningType, string> = {
  bug_fix: 'Bug',
  feature_refactor: 'Refactor',
  new_feature: 'New Feature',
};


// Shared markdown rendering components for professional document look
const docComponents = {
  h1: ({ children, ...props }: React.ComponentPropsWithoutRef<'h1'>) => (
    <div className="mb-8 pb-4 border-b-2 border-border">
      <h1 className="text-2xl font-bold text-ink tracking-tight" {...props}>{children}</h1>
    </div>
  ),
  h2: ({ children, ...props }: React.ComponentPropsWithoutRef<'h2'>) => (
    <div className="mt-10 mb-4">
      <h2 className="text-lg font-bold text-ink uppercase tracking-wide" {...props}>{children}</h2>
      <div className="mt-2 h-px bg-border" />
    </div>
  ),
  h3: ({ children, ...props }: React.ComponentPropsWithoutRef<'h3'>) => (
    <h3 className="text-base font-semibold text-ink mt-6 mb-2" {...props}>{children}</h3>
  ),
  p: ({ children, ...props }: React.ComponentPropsWithoutRef<'p'>) => (
    <p className="text-sm text-ink-secondary leading-relaxed mb-3" {...props}>{children}</p>
  ),
  ul: ({ children, ...props }: React.ComponentPropsWithoutRef<'ul'>) => (
    <ul className="space-y-1.5 mb-4 ml-1" {...props}>{children}</ul>
  ),
  ol: ({ children, ...props }: React.ComponentPropsWithoutRef<'ol'>) => (
    <ol className="space-y-2 mb-4 ml-1 list-none" {...props}>{children}</ol>
  ),
  li: ({ children, ...props }: React.ComponentPropsWithoutRef<'li'>) => (
    <li className="text-sm text-ink-secondary leading-relaxed flex items-start gap-2" {...props}>
      <span className="mt-1.5 flex-shrink-0 w-1.5 h-1.5 bg-ink-muted" />
      <span className="flex-1">{children}</span>
    </li>
  ),
  strong: ({ children, ...props }: React.ComponentPropsWithoutRef<'strong'>) => (
    <strong className="font-semibold text-ink" {...props}>{children}</strong>
  ),
  hr: () => <div className="my-8 border-t border-border" />,
  code: ({ children, ...props }: React.ComponentPropsWithoutRef<'code'>) => (
    <code className="bg-surface-light border border-border text-xs font-mono px-1.5 py-0.5" {...props}>{children}</code>
  ),
  pre: ({ children, ...props }: React.ComponentPropsWithoutRef<'pre'>) => (
    <pre className="bg-surface-light border border-border p-4 text-xs font-mono overflow-auto mb-4" {...props}>{children}</pre>
  ),
  table: ({ children, ...props }: React.ComponentPropsWithoutRef<'table'>) => (
    <div className="overflow-auto mb-4 border border-border">
      <table className="w-full text-sm" {...props}>{children}</table>
    </div>
  ),
  th: ({ children, ...props }: React.ComponentPropsWithoutRef<'th'>) => (
    <th className="bg-surface-light text-left text-xs font-semibold text-ink uppercase tracking-wider px-4 py-2.5 border-b border-border" {...props}>{children}</th>
  ),
  td: ({ children, ...props }: React.ComponentPropsWithoutRef<'td'>) => (
    <td className="px-4 py-2 text-sm text-ink-secondary border-b border-border" {...props}>{children}</td>
  ),
  blockquote: ({ children, ...props }: React.ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote className="border-l-3 border-border-strong bg-surface-light px-4 py-3 mb-4 text-sm text-ink-muted italic" {...props}>{children}</blockquote>
  ),
};

function SortableRoadmapCard({ item, index, isExpanded, onToggle, onStatusChange, onNotesChange }: { item: BacklogItem; index: number; isExpanded: boolean; onToggle: () => void; onStatusChange: (status: BacklogStatus) => void; onNotesChange: (notes: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${isDragging ? 'z-10 relative' : ''}`}
    >
      <div
        className={`card-panel transition-all duration-200 overflow-hidden hover:shadow-md hover:border-spectrum-blue/30 ${
          isDragging ? 'border-spectrum-blue/50 shadow-lg' : ''
        }`}
      >
        {/* Card header — clickable */}
        <button
          onClick={onToggle}
          className="w-full text-left px-5 py-4 group"
        >
          <div className="flex items-start gap-3">
            {/* Drag handle */}
            <div
              className="flex-shrink-0 cursor-grab active:cursor-grabbing text-ink-muted/40 hover:text-ink-muted transition-colors mt-0.5"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              {...attributes}
              {...listeners}
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
              </svg>
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono text-ink-muted">#{index + 1}</span>
                <span className={`text-[14px] font-display font-bold capitalize px-2 py-0.5 border rounded ${priorityColors[item.priority] || priorityColors.low}`}>
                  {item.priority}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const current: BacklogStatus = item.status || 'todo';
                    onStatusChange(nextStatus[current]);
                  }}
                  className={`text-[14px] font-display font-bold px-2 py-0.5 border rounded transition-colors hover:opacity-80 ${statusBadgeColors[item.status || 'todo']}`}
                >
                  {statusBadgeLabels[item.status || 'todo']}
                </button>
                {item.type && (
                  <span className={`text-[14px] font-display font-bold px-2 py-0.5 border rounded ${typeColors[item.type]}`}>
                    {typeLabels[item.type]}
                  </span>
                )}
              </div>
              <h3 className="text-[15px] font-bold text-ink">{item.title}</h3>
              <p className="text-xs text-ink-secondary mt-1 line-clamp-2">{item.description}</p>

              {/* Stats row */}
              <div className="flex items-center gap-4 mt-3">
                {item.estimatedTasks != null && (
                  <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    <span>{item.estimatedTasks} tasks</span>
                  </div>
                )}
                {item.storyPoints != null && (
                  <div className="group/sp flex items-center gap-1.5 text-xs text-ink-muted">
                    <span className="group-hover/sp:hidden">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </span>
                    <span className="hidden group-hover/sp:inline text-sm">🚀</span>
                    <span>{item.storyPoints} story pts</span>
                  </div>
                )}
                {item.prdStatus === 'complete' && (
                  <div className="flex items-center gap-1 text-xs text-success">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    <span>PRD ready</span>
                  </div>
                )}
              </div>
            </div>

            {/* Expand chevron */}
            <svg
              className={`w-4 h-4 text-ink-muted flex-shrink-0 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {/* Expanded content */}
        {isExpanded && (
          <div className="border-t border-border px-5 py-6 space-y-6">
            {item.prd ? (
              <ReactMarkdown components={docComponents}>{item.prd}</ReactMarkdown>
            ) : (
              <p className="text-sm text-ink-muted italic">No PRD generated yet.</p>
            )}

            {/* Notes */}
            <div>
              <label className="text-sm font-sans font-medium text-ink-muted">Notes</label>
              <textarea
                defaultValue={item.notes || ''}
                onBlur={(e) => onNotesChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                placeholder="Add free-form notes..."
                className="input-inset mt-1.5 w-full border border-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/50 focus:outline-none focus:ring-2 focus:ring-border-strong/30 focus:border-border-strong resize-y min-h-[80px]"
                rows={3}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjectHomeScreen() {
  const {
    currentProject,
    tasks,
    backlog,
    chatMessages,
    gapAnalyses,
    gitEvents,
    deployments,
    planningChats,
    sprints,
    projectHomeTab,
    setProjectHomeTab,
    planSubTab,
    setPlanSubTab,
    shipSubTab,
    setShipSubTab,
    generateBacklogPRD,
    reorderBacklog,
    updateBacklogItem,
    addSprint,
    renameSprint,
    removeSprint,
    archiveSprint,
  } = useAppStore();

  const [prd, setPrd] = useState<string | null>(null);
  const [expandedBacklogId, setExpandedBacklogId] = useState<string | null>(null);
  const [expandedRoadmapId, setExpandedRoadmapId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [backlogFilter, setBacklogFilter] = useState<'all' | BacklogStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | PlanningType>('all');
  const [renamingSprintId, setRenamingSprintId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Load PRD on mount
  useEffect(() => {
    if (currentProject) {
      window.api.storage.getPRD(currentProject.slug).then(setPrd).catch(() => setPrd(null));
    }
  }, [currentProject]);

  if (!currentProject) return null;

  const docCards = [
    {
      id: 'prd',
      title: 'Product Requirements Document',
      description: 'Core product spec, user stories, features, and data model',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      available: !!prd,
      preview: prd ? prd.split('\n').filter(l => l.trim()).slice(0, 3).join(' ').substring(0, 120) + '...' : null,
    },
    {
      id: 'chat-history',
      title: 'Discovery Chat',
      description: 'Conversation log from the discovery phase',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      available: chatMessages.length > 0,
      preview: chatMessages.length > 0 ? `${chatMessages.length} messages` : null,
    },
    {
      id: 'gap-analysis',
      title: 'Gap Analysis',
      description: 'Identified gaps between PRD and implementation',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      available: gapAnalyses.length > 0,
      preview: gapAnalyses.length > 0 ? `${gapAnalyses.length} ${gapAnalyses.length === 1 ? 'analysis' : 'analyses'}` : null,
    },
    {
      id: 'feature-prds',
      title: 'Feature PRDs',
      description: 'Individual PRDs for backlog features',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      available: backlog.length > 0,
      preview: backlog.length > 0 ? `${backlog.length} ${backlog.length === 1 ? 'feature' : 'features'}` : null,
    },
  ];

  const renderDocumentViewer = (docId: string) => {
    switch (docId) {
      case 'prd':
        return prd ? (
          <div className="card-panel p-8 md:p-12">
            <ReactMarkdown components={docComponents}>{prd}</ReactMarkdown>
          </div>
        ) : null;
      case 'chat-history':
        return (
          <div className="card-panel p-8 md:p-10 space-y-4">
            <h1 className="text-2xl font-bold text-ink mb-6">Discovery Chat History</h1>
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-3 ${msg.role === 'user' ? 'bg-spectrum-blue/10 text-ink' : 'bg-surface-light text-ink-secondary'}`}>
                  <p className="text-xs font-medium text-ink-muted mb-1">{msg.role === 'user' ? 'You' : 'Claude'}</p>
                  <div className="prose prose-sm max-w-none prose-p:text-inherit prose-p:leading-relaxed">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      case 'gap-analysis':
        return (
          <div className="card-panel p-8 md:p-10 space-y-6">
            <h1 className="text-2xl font-bold text-ink mb-6">Gap Analysis</h1>
            {gapAnalyses.map((analysis) => (
              <div key={analysis.id} className="bg-surface-light p-5 border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-ink">Pass {analysis.pass} — Grade: {analysis.grade}/100</span>
                  <span className="text-xs text-ink-muted">{new Date(analysis.timestamp).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-ink-secondary">{analysis.summary}</p>
                {analysis.findings.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {analysis.findings.map((f, j) => (
                      <div key={j} className="flex items-start gap-2 text-sm">
                        <span className={`px-1.5 py-0.5 text-xs font-medium ${
                          f.severity === 'missing' ? 'bg-spectrum-red/20 text-spectrum-red' :
                          f.severity === 'incomplete' ? 'bg-spectrum-yellow/20 text-spectrum-yellow' :
                          'bg-spectrum-blue/20 text-spectrum-blue'
                        }`}>{f.severity}</span>
                        <span className="text-ink-secondary">{f.description}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      case 'feature-prds':
        return (
          <div className="card-panel p-8 md:p-10 space-y-4">
            <h1 className="text-2xl font-bold text-ink mb-6">Feature PRDs</h1>
            {backlog.map((item) => (
              <div key={item.id} className="bg-surface-light border border-border overflow-hidden">
                <div className="px-5 py-3 flex items-center justify-between">
                  <button
                    onClick={() => setExpandedBacklogId(expandedBacklogId === item.id ? null : item.id)}
                    className="flex items-center gap-2 text-sm font-medium text-ink hover:text-spectrum-blue transition-colors text-left"
                  >
                    <svg
                      className={`w-3.5 h-3.5 transition-transform ${expandedBacklogId === item.id ? 'rotate-90' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    {item.title}
                  </button>
                  <div className="flex items-center gap-2">
                    {item.prdStatus === 'generating' && (
                      <div className="flex items-center gap-1.5">
                        <div className="w-3.5 h-3.5 border-4 border-ink-muted border-t-transparent animate-spin" />
                        <span className="text-xs text-ink-muted">Generating...</span>
                      </div>
                    )}
                    {item.prdStatus === 'complete' && (
                      <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                    {item.prdStatus === 'failed' && (
                      <button
                        onClick={() => generateBacklogPRD(item.id)}
                        className="text-xs text-error hover:text-error/80 transition-colors"
                      >
                        Retry
                      </button>
                    )}
                    {(item.prdStatus === 'pending' || !item.prdStatus) && (
                      <button
                        onClick={() => generateBacklogPRD(item.id)}
                        className="text-xs text-spectrum-blue hover:text-spectrum-blue/80 transition-colors"
                      >
                        Generate PRD
                      </button>
                    )}
                  </div>
                </div>
                {expandedBacklogId === item.id && item.prd && (
                  <div className="border-t border-border px-5 py-6">
                    <ReactMarkdown components={docComponents}>{item.prd}</ReactMarkdown>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  // Helper to get relative time string
  const relativeTime = (timestamp: string) => {
    const now = Date.now();
    const then = new Date(timestamp).getTime();
    const diff = now - then;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const renderOverview = () => {
    const completedTasks = tasks.filter((t) => t.completed).length;
    const totalTasks = tasks.length;
    const latestDeployment = deployments.length > 0
      ? [...deployments].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0]
      : null;

    // Backlog status counts
    const statusCounts = {
      todo: backlog.filter((b) => !b.status || b.status === 'todo').length,
      in_progress: backlog.filter((b) => b.status === 'in_progress').length,
      done: backlog.filter((b) => b.status === 'done').length,
    };
    const totalBacklog = backlog.length;

    // Priority counts
    const priorityCounts = {
      high: backlog.filter((b) => b.priority === 'high').length,
      medium: backlog.filter((b) => b.priority === 'medium').length,
      low: backlog.filter((b) => b.priority === 'low').length,
    };

    // Recent activity: merge gitEvents + deployments, sort by timestamp, take 5
    const recentActivity = [
      ...gitEvents.map((e) => ({
        id: e.id,
        type: 'git' as const,
        description: e.commitMessage || e.taskTitle || e.type.replace(/_/g, ' '),
        timestamp: e.timestamp,
        eventType: e.type,
      })),
      ...deployments.map((d) => ({
        id: d.id,
        type: 'deploy' as const,
        description: d.commitMessage || `Deploy to ${d.branch}`,
        timestamp: d.timestamp,
        eventType: d.status,
      })),
    ]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);

    const hasStatusData = statusCounts.in_progress > 0 || statusCounts.done > 0;

    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Backlog card */}
          <div className="card-panel p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-2 bg-spectrum-blue/15 text-spectrum-blue rounded-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-ink-muted">Backlog</h3>
            </div>
            <p className="text-3xl font-bold text-ink">{totalBacklog}</p>
            <p className="text-xs text-ink-muted mt-1">
              {priorityCounts.high > 0 && <span className="text-spectrum-orange">{priorityCounts.high} high</span>}
              {priorityCounts.high > 0 && priorityCounts.medium > 0 && ' · '}
              {priorityCounts.medium > 0 && <span className="text-spectrum-yellow">{priorityCounts.medium} med</span>}
              {(priorityCounts.high > 0 || priorityCounts.medium > 0) && priorityCounts.low > 0 && ' · '}
              {priorityCounts.low > 0 && <span className="text-spectrum-blue">{priorityCounts.low} low</span>}
              {totalBacklog === 0 && 'No items yet'}
            </p>
          </div>

          {/* Build Tasks card */}
          <div className="card-panel p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-2 bg-spectrum-orange/15 text-spectrum-orange rounded-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-ink-muted">Build Tasks</h3>
            </div>
            <p className="text-3xl font-bold text-ink">
              {completedTasks}<span className="text-lg font-normal text-ink-muted">/{totalTasks}</span>
            </p>
            <p className="text-xs text-ink-muted mt-1">
              {totalTasks === 0 ? 'No tasks yet' : completedTasks === totalTasks ? 'All complete' : `${totalTasks - completedTasks} remaining`}
            </p>
          </div>

          {/* Deployments card */}
          <div className="card-panel p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-2 bg-spectrum-purple/15 text-spectrum-purple rounded-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-ink-muted">Deployments</h3>
            </div>
            <p className="text-3xl font-bold text-ink">{deployments.length}</p>
            <p className="text-xs text-ink-muted mt-1">
              {latestDeployment ? (
                <span className={latestDeployment.status === 'success' ? 'text-spectrum-green' : latestDeployment.status === 'failed' ? 'text-spectrum-red' : 'text-spectrum-yellow'}>
                  Latest: {latestDeployment.status}
                </span>
              ) : (
                'No deployments yet'
              )}
            </p>
          </div>

          {/* Project Status card */}
          <div className="card-panel p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-2 bg-spectrum-green/15 text-spectrum-green rounded-md">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-ink-muted">Status</h3>
            </div>
            <div className="mt-1">
              <span className={`px-2 py-0.5 text-xs font-medium ${statusColor[currentProject.status]}`}>
                {statusLabel[currentProject.status]}
              </span>
            </div>
          </div>
        </div>

        {/* Backlog status bar */}
        {totalBacklog > 0 && (
          <div className="card-panel p-4">
            <h3 className="text-base font-sans font-semibold text-ink-muted mb-3">
              {hasStatusData ? 'Backlog Progress' : 'Backlog by Priority'}
            </h3>
            {hasStatusData ? (
              <>
                <div className="flex overflow-hidden h-3 bg-surface-light">
                  {statusCounts.done > 0 && (
                    <div
                      className="bg-spectrum-green transition-all"
                      style={{ width: `${(statusCounts.done / totalBacklog) * 100}%` }}
                    />
                  )}
                  {statusCounts.in_progress > 0 && (
                    <div
                      className="bg-spectrum-orange transition-all"
                      style={{ width: `${(statusCounts.in_progress / totalBacklog) * 100}%` }}
                    />
                  )}
                  {statusCounts.todo > 0 && (
                    <div
                      className="bg-surface transition-all"
                      style={{ width: `${(statusCounts.todo / totalBacklog) * 100}%` }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-ink-muted">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-spectrum-green" /> Done {statusCounts.done}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-spectrum-orange" /> In Progress {statusCounts.in_progress}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-surface" /> Todo {statusCounts.todo}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex overflow-hidden h-3 bg-surface-light">
                  {priorityCounts.high > 0 && (
                    <div
                      className="bg-spectrum-orange transition-all"
                      style={{ width: `${(priorityCounts.high / totalBacklog) * 100}%` }}
                    />
                  )}
                  {priorityCounts.medium > 0 && (
                    <div
                      className="bg-spectrum-yellow transition-all"
                      style={{ width: `${(priorityCounts.medium / totalBacklog) * 100}%` }}
                    />
                  )}
                  {priorityCounts.low > 0 && (
                    <div
                      className="bg-spectrum-blue transition-all"
                      style={{ width: `${(priorityCounts.low / totalBacklog) * 100}%` }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-ink-muted">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-spectrum-orange" /> High {priorityCounts.high}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-spectrum-yellow" /> Medium {priorityCounts.medium}</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 bg-spectrum-blue" /> Low {priorityCounts.low}</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Recent Activity */}
        <div className="card-panel p-4">
          <h3 className="text-base font-sans font-semibold text-ink-muted mb-3">Recent Activity</h3>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-ink-muted py-4 text-center">No activity yet</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className={`p-1.5 flex-shrink-0 ${
                    activity.type === 'deploy'
                      ? 'bg-spectrum-blue/10 text-spectrum-blue'
                      : 'bg-surface-light text-ink-muted'
                  }`}>
                    {activity.type === 'deploy' ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink truncate">{activity.description}</p>
                  </div>
                  <span className="text-xs text-ink-muted flex-shrink-0">{relativeTime(activity.timestamp)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDocuments = () => {
    // Document viewer mode
    if (selectedDoc) {
      return (
        <div className="max-w-5xl mx-auto space-y-4">
          <button
            onClick={() => setSelectedDoc(null)}
            className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Documents
          </button>
          {renderDocumentViewer(selectedDoc)}
        </div>
      );
    }

    // Library grid mode
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="mb-2">
          <h2 className="text-xl font-bold text-ink">Documents</h2>
          <p className="text-xs text-ink-muted mt-0.5">Project specs, PRDs, and generated documentation</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {docCards.map((card) => (
            <button
              key={card.id}
              onClick={() => card.available && setSelectedDoc(card.id)}
              disabled={!card.available}
              className={`text-left card-panel p-5 transition-colors ${
                card.available
                  ? 'hover:border-spectrum-blue/50 cursor-pointer'
                  : 'opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-2.5 ${card.available ? 'bg-spectrum-blue/10 text-spectrum-blue' : 'bg-border/30 text-ink-muted'}`}>
                  {card.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-ink">{card.title}</h3>
                  <p className="text-xs text-ink-muted mt-1">{card.description}</p>
                  {card.preview && (
                    <p className="text-xs text-ink-muted/70 mt-2 truncate">{card.preview}</p>
                  )}
                  {!card.available && (
                    <p className="text-xs text-ink-muted/50 mt-2 italic">Not available yet</p>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderPlanning = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full overflow-hidden border-[3px] border-spectrum-blue transition-shadow duration-300 hover:shadow-[0_0_12px_rgba(82,158,214,0.6)]">
          <img src={houstonAvatar} alt="Houston" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
        </div>
        <h3 className="text-lg font-sans font-bold text-ink mb-2">Plan with Houston</h3>
        <p className="text-sm text-ink-muted mb-6">
          Use Houston to brainstorm features, plan bug fixes, and add items to your backlog.
        </p>
        <button
          onClick={() => (window as unknown as { openHouston?: () => void }).openHouston?.()}
          className="btn-solid-primary px-6 py-2.5 text-sm font-medium"
        >
          Open Houston
        </button>
      </div>
    </div>
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = backlog.findIndex((item) => item.id === active.id);
    const newIndex = backlog.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(backlog, oldIndex, newIndex);
    reorderBacklog(reordered);
  };

  const renderBacklog = () => {
    const filterCounts = {
      all: backlog.length,
      todo: backlog.filter((b) => !b.status || b.status === 'todo').length,
      in_progress: backlog.filter((b) => b.status === 'in_progress').length,
      done: backlog.filter((b) => b.status === 'done').length,
    };

    const typeCounts: Record<'all' | PlanningType, number> = {
      all: backlog.length,
      bug_fix: backlog.filter((b) => b.type === 'bug_fix').length,
      feature_refactor: backlog.filter((b) => b.type === 'feature_refactor').length,
      new_feature: backlog.filter((b) => b.type === 'new_feature').length,
    };

    const filteredBacklog = backlog
      .filter((b) => {
        if (backlogFilter !== 'all') {
          const s = b.status || 'todo';
          if (s !== backlogFilter) return false;
        }
        return true;
      });

    const filterButtons: { key: 'all' | BacklogStatus; label: string }[] = [
      { key: 'all', label: 'All' },
      { key: 'todo', label: 'Queued' },
      { key: 'in_progress', label: 'In Orbit' },
      { key: 'done', label: 'Landed' },
    ];

    const typeFilterButtons: { key: 'all' | PlanningType; label: string }[] = [
      { key: 'all', label: 'All Types' },
      { key: 'bug_fix', label: 'Bug' },
      { key: 'feature_refactor', label: 'Refactor' },
      { key: 'new_feature', label: 'New Feature' },
    ];

    const allFilteredIds = filteredBacklog.map((item) => item.id);

    return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-xl font-bold text-ink">Backlog</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {backlog.length} {backlog.length === 1 ? 'item' : 'items'} — drag to reorder
          </p>
        </div>
      </div>

      {backlog.length > 0 && (
        <div className="flex items-center gap-1 bg-surface border border-border p-1 rounded-lg">
          {filterButtons.map((fb) => (
            <button
              key={fb.key}
              onClick={() => setBacklogFilter(fb.key)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors rounded-md ${
                backlogFilter === fb.key
                  ? 'bg-ink/10 text-ink'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-card'
              }`}
            >
              {fb.label} <span className="ml-1 opacity-60">{filterCounts[fb.key]}</span>
            </button>
          ))}
        </div>
      )}

      {backlog.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <svg className="w-12 h-12 text-ink-muted/30 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <p className="text-sm text-ink-muted font-medium">No backlog items yet</p>
          <p className="text-xs text-ink-muted/70 mt-1">Add items from the Planning tab to see them here</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={allFilteredIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {filteredBacklog.map((item, index) => (
                <SortableRoadmapCard
                  key={item.id}
                  item={item}
                  index={index}
                  isExpanded={expandedRoadmapId === item.id}
                  onToggle={() => setExpandedRoadmapId(expandedRoadmapId === item.id ? null : item.id)}
                  onStatusChange={(status) => updateBacklogItem(item.id, { status })}
                  onNotesChange={(notes) => updateBacklogItem(item.id, { notes })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
    );
  };

  const renderRoadmap = () => {
    const activeSprints = [...sprints].filter((s) => !s.archived && s.name !== 'MVP').sort((a, b) => a.order - b.order);
    const archivedSprints = [...sprints].filter((s) => s.archived && s.name !== 'MVP').sort((a, b) => a.order - b.order);
    const recommendedCap = 21;

    // Items with no sprintId
    const unassigned = backlog.filter((b) => !b.sprintId);

    return (
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-xl font-bold text-ink">Roadmap</h2>
            <p className="text-xs text-ink-muted mt-0.5">
              Plan sprints and allocate backlog items — recommended {recommendedCap} SP per sprint
            </p>
          </div>
          <button
            onClick={() => {
              const num = sprints.length + 1;
              addSprint(`Sprint ${num}`);
            }}
            className="btn-solid-primary flex items-center gap-2 px-5 py-2.5 text-sm font-bold"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New Sprint
          </button>
        </div>

        {activeSprints.length === 0 && archivedSprints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-sm text-ink-muted font-medium">No missions planned yet</p>
            <p className="text-xs text-ink-muted/70 mt-1">Add backlog items to launch your first sprint</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeSprints.map((sprint) => {
              const items = backlog.filter((b) => b.sprintId === sprint.id);
              const totalSP = items.reduce((sum, b) => sum + (b.storyPoints || 0), 0);
              const overCap = totalSP > recommendedCap;

              return (
                <div key={sprint.id} className="card-panel overflow-hidden transition-all duration-200 hover:shadow-md hover:border-spectrum-blue/30">
                  {/* Sprint header */}
                  <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {renamingSprintId === sprint.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={() => {
                            if (renameValue.trim()) renameSprint(sprint.id, renameValue.trim());
                            setRenamingSprintId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              if (renameValue.trim()) renameSprint(sprint.id, renameValue.trim());
                              setRenamingSprintId(null);
                            }
                            if (e.key === 'Escape') setRenamingSprintId(null);
                          }}
                          className="input-inset text-sm font-semibold text-ink bg-transparent border-b border-spectrum-blue outline-none px-0 py-0"
                        />
                      ) : (
                        <h3 className="text-sm font-semibold text-ink">{sprint.name}</h3>
                      )}
                      <span className="text-xs text-ink-muted">({items.length} {items.length === 1 ? 'item' : 'items'})</span>
                      <span className={`text-[14px] font-display font-bold px-2 py-0.5 border rounded ${overCap ? 'bg-spectrum-orange/15 text-spectrum-orange border-spectrum-orange/30' : 'bg-spectrum-blue/15 text-spectrum-blue border-spectrum-blue/30'}`}>
                        {totalSP} / {recommendedCap} SP
                      </span>
                      {overCap && (
                        <span className="text-[14px] font-display font-bold text-spectrum-orange">Over capacity</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setRenamingSprintId(sprint.id);
                          setRenameValue(sprint.name);
                        }}
                        className="p-1 text-ink-muted hover:text-ink transition-colors"
                        title="Rename sprint"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => archiveSprint(sprint.id)}
                        className="p-1 text-ink-muted hover:text-spectrum-green transition-colors"
                        title="Archive sprint"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                        </svg>
                      </button>
                      <button
                        onClick={() => removeSprint(sprint.id)}
                        className="p-1 text-ink-muted hover:text-spectrum-red transition-colors"
                        title="Delete sprint"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Sprint items */}
                  {items.length === 0 ? (
                    <div className="px-5 py-4 flex items-center justify-between">
                      <span className="text-sm text-ink-muted">Empty orbit — assign items from the backlog</span>
                      <div className="flex items-center gap-1">
                        {unassigned.length > 0 && (
                          <button
                            onClick={() => { setProjectHomeTab('plan'); setPlanSubTab('backlog'); }}
                            className="p-1.5 text-ink-muted hover:text-ink hover:bg-ink/10 rounded transition-colors"
                            title={`Assign from backlog (${unassigned.length} unassigned)`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => { setProjectHomeTab('plan'); setPlanSubTab('planning'); }}
                          className="p-1.5 text-ink-muted hover:text-ink hover:bg-ink/10 rounded transition-colors"
                          title="Plan new work item"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {items.map((item) => (
                        <div key={item.id} className="px-5 py-3 flex items-center gap-3 transition-colors duration-150 hover:bg-spectrum-blue/5">
                          <span className={`text-[14px] font-display font-bold capitalize px-2 py-0.5 border rounded ${priorityColors[item.priority] || priorityColors.low}`}>
                            {item.priority}
                          </span>
                          <span className={`text-[14px] font-display font-bold px-2 py-0.5 border rounded ${statusBadgeColors[item.status || 'todo']}`}>
                            {statusBadgeLabels[item.status || 'todo']}
                          </span>
                          <span className="text-sm text-ink flex-1 truncate">{item.title}</span>
                          {item.storyPoints != null && (
                            <span className="text-xs text-ink-muted">{item.storyPoints} SP</span>
                          )}
                          <select
                            value={item.sprintId || ''}
                            onChange={(e) => updateBacklogItem(item.id, { sprintId: e.target.value || undefined })}
                            className="input-inset text-xs border border-border px-1.5 py-1 bg-surface text-ink cursor-pointer"
                          >
                            <option value="">Unassigned</option>
                            {activeSprints.map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Unassigned section */}
            {unassigned.length > 0 && (
              <div className="card-panel overflow-hidden">
                <div className="px-5 py-3 border-b border-border">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-ink-muted">Unassigned</h3>
                    <span className="text-xs text-ink-muted">({unassigned.length})</span>
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {unassigned.map((item) => (
                    <div key={item.id} className="px-5 py-3 flex items-center gap-3">
                      <span className={`text-[13px] font-display font-semibold capitalize px-1.5 py-0.5 border ${priorityColors[item.priority] || priorityColors.low}`}>
                        {item.priority}
                      </span>
                      <span className={`text-[13px] font-display font-semibold px-1.5 py-0.5 border ${statusBadgeColors[item.status || 'todo']}`}>
                        {statusBadgeLabels[item.status || 'todo']}
                      </span>
                      <span className="text-sm text-ink flex-1 truncate">{item.title}</span>
                      {item.storyPoints != null && (
                        <span className="text-xs text-ink-muted">{item.storyPoints} SP</span>
                      )}
                      <select
                        value=""
                        onChange={(e) => updateBacklogItem(item.id, { sprintId: e.target.value || undefined })}
                        className="input-inset text-xs border border-border px-1.5 py-1 bg-surface text-ink cursor-pointer"
                      >
                        <option value="">Unassigned</option>
                        {activeSprints.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Archived sprints */}
            {archivedSprints.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-sm text-ink-muted hover:text-ink transition-colors flex items-center gap-2 py-2">
                  <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Archived ({archivedSprints.length})
                </summary>
                <div className="space-y-4 mt-2">
                  {archivedSprints.map((sprint) => {
                    const items = backlog.filter((b) => b.sprintId === sprint.id);
                    const totalSP = items.reduce((sum, b) => sum + (b.storyPoints || 0), 0);
                    return (
                      <div key={sprint.id} className="card-panel overflow-hidden opacity-60">
                        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <h3 className="text-sm font-semibold text-ink">{sprint.name}</h3>
                            <span className="text-xs text-ink-muted">({items.length} {items.length === 1 ? 'item' : 'items'})</span>
                            <span className="text-[14px] font-display font-bold px-2 py-0.5 border rounded bg-ink-muted/10 text-ink-muted border-border">
                              {totalSP} SP
                            </span>
                          </div>
                          <button
                            onClick={() => removeSprint(sprint.id)}
                            className="p-1 text-ink-muted hover:text-spectrum-red transition-colors"
                            title="Delete sprint"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                        {items.length > 0 && (
                          <div className="divide-y divide-border">
                            {items.map((item) => (
                              <div key={item.id} className="px-5 py-3 flex items-center gap-3">
                                <span className={`text-[14px] font-display font-bold capitalize px-2 py-0.5 border rounded ${priorityColors[item.priority] || priorityColors.low}`}>
                                  {item.priority}
                                </span>
                                <span className="text-sm text-ink flex-1 truncate">{item.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderPlanTab = () => (
    <>
      {/* Segmented control */}
      <div className="flex items-center gap-1 mb-4">
        {(['planning', 'backlog', 'roadmap'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setPlanSubTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              planSubTab === tab
                ? 'bg-accent/10 text-accent'
                : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
            }`}
          >
            {tab === 'planning' ? 'Planning' : tab === 'backlog' ? 'Backlog' : 'Roadmap'}
          </button>
        ))}
      </div>
      {/* Sub-tab content */}
      <div className="flex-1 min-h-0">
        {planSubTab === 'planning' && <div className="h-full flex flex-col overflow-hidden">{renderPlanning()}</div>}
        {planSubTab === 'backlog' && <div className="h-full overflow-y-auto">{renderBacklog()}</div>}
        {planSubTab === 'roadmap' && <div className="h-full overflow-y-auto">{renderRoadmap()}</div>}
      </div>
    </>
  );

  const renderShipTab = () => (
    <>
      <div className="flex items-center gap-1 mb-4">
        {(['commits', 'deploys'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setShipSubTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              shipSubTab === tab
                ? 'bg-accent/10 text-accent'
                : 'text-ink-muted hover:text-ink hover:bg-surface-hover'
            }`}
          >
            {tab === 'commits' ? 'Commits' : 'Deploys'}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {shipSubTab === 'commits' && <div className="h-full flex flex-col overflow-hidden"><GitHistoryScreen /></div>}
        {shipSubTab === 'deploys' && <div className="h-full flex flex-col overflow-hidden"><DeploymentsScreen /></div>}
      </div>
    </>
  );

  const renderSettings = () => (
    <div className="space-y-6">
      <div className="card-panel">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-lg font-sans font-semibold text-ink">Project Settings</h3>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-sm font-sans font-medium text-ink-muted">Name</label>
            <p className="text-sm text-ink mt-1">{currentProject.name}</p>
          </div>
          <div>
            <label className="text-sm font-sans font-medium text-ink-muted">Slug</label>
            <p className="text-sm text-ink font-mono mt-1">{currentProject.slug}</p>
          </div>
          <div>
            <label className="text-sm font-sans font-medium text-ink-muted">Path</label>
            <p className="text-sm text-ink font-mono mt-1 break-all">{currentProject.projectPath}</p>
          </div>
          <div>
            <label className="text-sm font-sans font-medium text-ink-muted">Status</label>
            <p className="text-sm text-ink mt-1">
              <span className={`px-2 py-0.5 text-xs font-medium ${statusColor[currentProject.status]}`}>
                {statusLabel[currentProject.status]}
              </span>
            </p>
          </div>
          {currentProject.githubRepo && (
            <div>
              <label className="text-sm font-sans font-medium text-ink-muted">GitHub</label>
              <p className="text-sm text-spectrum-blue mt-1 break-all">{currentProject.githubRepo}</p>
            </div>
          )}
          {currentProject.vercelUrl && (
            <div>
              <label className="text-sm font-sans font-medium text-ink-muted">Vercel</label>
              <p className="text-sm text-spectrum-blue mt-1 break-all">{currentProject.vercelUrl}</p>
            </div>
          )}
        </div>
      </div>

      {/* Open in Editor */}
      <button
        onClick={() => window.api.shell.openInEditor(currentProject.projectPath)}
        className="btn-solid px-4 py-2.5 text-sm text-ink font-medium"
      >
        Open in Editor
      </button>
    </div>
  );

  const renderContent = () => {
    switch (projectHomeTab) {
      case 'plan':
        return renderPlanTab();
      case 'docs':
        return renderDocuments();
      case 'ship':
        return renderShipTab();
      case 'data':
        return <DatabaseScreen />;
      case 'settings':
        return renderSettings();
      default:
        return renderPlanTab();
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <main className={`flex-1 p-6 ${['plan', 'ship'].includes(projectHomeTab) ? 'flex flex-col overflow-hidden' : 'overflow-y-auto'}`}>
        {renderContent()}
      </main>
    </div>
  );
}
