import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useProjectStore } from '../store/ProjectStoreContext';
import GitHistoryScreen from './GitHistoryScreen';
import DeploymentsScreen from './DeploymentsScreen';
import DatabaseScreen from './DatabaseScreen';
import type { ProjectStatus, BacklogItem, Sprint, PlanningType, FeatureModule, CodeIssue } from '../types';
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
  arrayMove,
} from '@dnd-kit/sortable';
import mcAvatar from '../assets/mc-avatar.webp';
import AssistantCallout from '../components/AssistantCallout';
import StatusLight from '../components/StatusLight';
import SortableRoadmapCard from '../components/SortableRoadmapCard';
import { priorityColors } from '../components/SortableRoadmapCard';
import { StreamingText } from 'agent-native';
import { docComponents } from '../utils/markdown-components';
import ProgressRing from '../components/ProgressRing';
import CountdownTimer from '../components/CountdownTimer';
import { getBacklogItemStatus, sprintStatusToBacklogStatus } from '../utils/backlogStatus';
import type { BacklogStatus } from '../utils/backlogStatus';
import { getSprintReadiness } from '../utils/missionReadiness';


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
  idea: 'bg-accent/20 text-accent',
  discovery: 'bg-spectrum-purple/20 text-spectrum-purple',
  prd_review: 'bg-spectrum-purple/20 text-spectrum-purple',
  planning: 'bg-spectrum-yellow/20 text-spectrum-yellow',
  building: 'bg-spectrum-orange/20 text-spectrum-orange',
  previewing: 'bg-spectrum-green/20 text-spectrum-green',
  deploying: 'bg-accent/20 text-accent',
  complete: 'bg-spectrum-green/20 text-spectrum-green',
};


type Tab = 'plan' | 'docs' | 'ship' | 'data' | 'settings';




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
    removeBacklogItem,
    addSprint,
    updateSprint,
    renameSprint,
    removeSprint,
    setSprintStatus,
    startBuild,
    setScreen,
    planAndSprint,
    retryFailedPRDs,
    ensureAllPRDsGenerating,
    addToast,
    prdStreaming,
  } = useProjectStore();

  const [prd, setPrd] = useState<string | null>(null);
  const [features, setFeatures] = useState<FeatureModule[]>([]);
  const [issues, setIssues] = useState<CodeIssue[]>([]);
  const [expandedBacklogId, setExpandedBacklogId] = useState<string | null>(null);
  const [expandedRoadmapId, setExpandedRoadmapId] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [backlogFilter, setBacklogFilter] = useState<'all' | BacklogStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | PlanningType>('all');
  const [renamingSprintId, setRenamingSprintId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [planAndSprintingId, setPlanAndSprintingId] = useState<string | null>(null);

  // Load PRD, features, issues on mount
  useEffect(() => {
    if (currentProject) {
      window.api.storage.getPRD(currentProject.slug).then(setPrd).catch(() => setPrd(null));
      window.api.storage.getFeatures(currentProject.slug).then(setFeatures).catch(() => setFeatures([]));
      window.api.storage.getIssues(currentProject.slug).then(setIssues).catch(() => setIssues([]));
    }
  }, [currentProject]);

  // Stuck-recovery: reset orphaned 'generating' items to 'failed' on mount
  useEffect(() => {
    const stuck = backlog.filter((b) => b.prdStatus === 'generating');
    if (stuck.length > 0) {
      for (const item of stuck) {
        updateBacklogItem(item.id, { prdStatus: 'failed' });
      }
      addToast({
        type: 'warning',
        message: `${stuck.length} flight ${stuck.length === 1 ? 'plan was' : 'plans were'} interrupted. You can retry them.`,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-trigger pending PRDs for items in planning sprints
  useEffect(() => {
    const planningSprints = sprints.filter((s) => s.status === 'planning');
    for (const sprint of planningSprints) {
      const pendingItems = backlog.filter(
        (b) => b.sprintId === sprint.id && (!b.prdStatus || b.prdStatus === 'pending')
      );
      for (const item of pendingItems) {
        generateBacklogPRD(item.id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backlog.map((b) => `${b.id}:${b.sprintId}:${b.prdStatus}`).join(',')]);

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
                <div className={`max-w-[80%] px-4 py-3 ${msg.role === 'user' ? 'bg-accent/10 text-ink' : 'bg-surface-light text-ink-secondary'}`}>
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
                          'bg-accent/20 text-accent'
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
                    className="flex items-center gap-2 text-sm font-medium text-ink hover:text-accent transition-colors text-left"
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
                        className="text-xs text-accent hover:text-accent/80 transition-colors"
                      >
                        Generate Plan
                      </button>
                    )}
                  </div>
                </div>
                {expandedBacklogId === item.id && item.prd && (
                  <div className="border-t border-border px-5 py-6">
                    <ReactMarkdown components={docComponents}>{item.prd}</ReactMarkdown>
                  </div>
                )}
                {expandedBacklogId === item.id && !item.prd && item.prdStatus === 'generating' && prdStreaming[item.id] && (
                  <div className="border-t border-border px-5 py-6">
                    <StreamingText content={prdStreaming[item.id]} />
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
                  ? 'hover:border-accent/50 cursor-pointer'
                  : 'opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`p-2.5 ${card.available ? 'bg-accent/10 text-accent' : 'bg-border/30 text-ink-muted'}`}>
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
      <AssistantCallout
        message="Use the assistant to brainstorm features, plan bug fixes, and add items to your backlog."
        actions={[
          { label: 'Fix a Bug', onClick: () => window.openAssistant?.(), variant: 'secondary' },
          { label: 'Plan a Feature', onClick: () => window.openAssistant?.() },
        ]}
      />
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
    const filterCounts: Record<'all' | BacklogStatus, number> = {
      all: backlog.length,
      todo: backlog.filter((b) => getBacklogItemStatus(b, sprints) === 'todo').length,
      in_progress: backlog.filter((b) => getBacklogItemStatus(b, sprints) === 'in_progress').length,
      done: backlog.filter((b) => getBacklogItemStatus(b, sprints) === 'done').length,
    };

    const filteredBacklog = backlog
      .filter((b) => {
        if (backlogFilter !== 'all') {
          return getBacklogItemStatus(b, sprints) === backlogFilter;
        }
        return true;
      });

    const filterButtons: { key: 'all' | BacklogStatus; label: string }[] = [
      { key: 'all', label: 'All' },
      { key: 'todo', label: 'To Do' },
      { key: 'in_progress', label: 'In Progress' },
      { key: 'done', label: 'Done' },
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
        <AssistantCallout
          message="Backlog is empty. Add some items."
          ctaLabel="Add to Backlog"
          onCtaClick={() => setPlanSubTab('planning')}
        />
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
                  derivedStatus={getBacklogItemStatus(item, sprints)}
                  onNotesChange={(notes) => updateBacklogItem(item.id, { notes })}
                  onRemove={() => removeBacklogItem(item.id)}
                  sprints={sprints.filter((s) => s.status !== 'completed')}
                  onSprintAssign={(sprintId) => updateBacklogItem(item.id, { sprintId })}
                  onPlanAndSprint={!item.sprintId ? async () => {
                    setPlanAndSprintingId(item.id);
                    try {
                      await planAndSprint(item.id);
                    } finally {
                      setPlanAndSprintingId(null);
                    }
                  } : undefined}
                  isPlanAndSprinting={planAndSprintingId === item.id}
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
    const activeSprints = [...sprints].filter((s) => s.status !== 'completed' && s.name !== 'MVP').sort((a, b) => a.order - b.order);
    const completedSprints = [...sprints].filter((s) => s.status === 'completed' && s.name !== 'MVP').sort((a, b) => a.order - b.order);
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

        {activeSprints.length === 0 && completedSprints.length === 0 ? (
          <AssistantCallout
            message="No sprints created yet. Create one?"
            ctaLabel="New Sprint"
            onCtaClick={() => {
              const num = sprints.length + 1;
              addSprint(`Sprint ${num}`);
            }}
          />
        ) : (
          <div className="space-y-4">
            {activeSprints.map((sprint) => {
              const items = backlog.filter((b) => b.sprintId === sprint.id);
              const totalSP = items.reduce((sum, b) => sum + (b.storyPoints || 0), 0);
              const doneSP = sprint.status === 'completed' ? totalSP : 0;
              const overCap = totalSP > recommendedCap;
              const derivedStatus = sprintStatusToBacklogStatus(sprint.status);
              const readiness = getSprintReadiness(items);

              return (
                <div key={sprint.id} className="card-panel overflow-hidden transition-all duration-200 hover:shadow-md hover:border-accent/30">
                  {/* Sprint header */}
                  <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <ProgressRing completed={doneSP} total={totalSP} size={40} strokeWidth={3} />
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
                          className="input-inset text-sm font-semibold text-ink bg-transparent border-b border-accent outline-none px-0 py-0"
                        />
                      ) : (
                        <h3 className="text-sm font-semibold text-ink">{sprint.name}</h3>
                      )}
                      {/* Sprint status badge */}
                      <span className={`text-[11px] font-display font-bold uppercase tracking-wider px-2 py-0.5 border rounded ${
                        sprint.status === 'active'
                          ? 'bg-accent/15 text-accent border-accent/30'
                          : 'bg-surface-light text-ink-muted border-border'
                      }`}>
                        {sprint.status === 'active' ? 'Active' : 'Planning'}
                      </span>
                      <span className="text-xs text-ink-muted">({items.length} {items.length === 1 ? 'item' : 'items'})</span>
                      {/* Readiness badge — only for planning sprints with items */}
                      {sprint.status === 'planning' && items.length > 0 && (
                        readiness.isReady ? (
                          <span className="text-[11px] font-display font-bold px-2 py-0.5 bg-spectrum-green/15 text-spectrum-green border border-spectrum-green/30 rounded">
                            All Planned
                          </span>
                        ) : (
                          <span className={`text-[11px] font-display font-bold px-2 py-0.5 border rounded ${
                            readiness.isBlocked
                              ? 'bg-spectrum-red/15 text-spectrum-red border-spectrum-red/30'
                              : 'bg-spectrum-yellow/15 text-spectrum-yellow border-spectrum-yellow/30'
                          }`}>
                            {readiness.complete}/{readiness.total} Planned
                          </span>
                        )
                      )}
                      <span className={`text-[14px] font-display font-bold px-2 py-0.5 border rounded ${overCap ? 'bg-spectrum-orange/15 text-spectrum-orange border-spectrum-orange/30' : 'bg-accent/15 text-accent border-accent/30'}`}>
                        {totalSP} / {recommendedCap} SP
                      </span>
                      {overCap && (
                        <span className="text-[14px] font-display font-bold text-spectrum-orange">Over capacity</span>
                      )}
                      {sprint.deadline && <CountdownTimer deadline={sprint.deadline} />}
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Sprint status controls */}
                      {sprint.status === 'planning' && (
                        <button
                          onClick={() => setSprintStatus(sprint.id, 'active')}
                          disabled={!readiness.isReady}
                          className={`px-2.5 py-1 text-xs font-bold border rounded transition-colors ${
                            readiness.isReady
                              ? 'text-accent hover:bg-accent/10 border-accent/30 cursor-pointer'
                              : 'text-ink-muted border-border opacity-60 cursor-not-allowed'
                          }`}
                          title={readiness.isReady ? 'Start this sprint' : readiness.blockReason || 'Sprint not ready'}
                        >
                          Start Sprint
                        </button>
                      )}
                      {sprint.status === 'active' && (
                        <>
                          <button
                            onClick={() => startBuild(sprint.id)}
                            className="px-2.5 py-1 text-xs font-bold text-white bg-accent hover:bg-accent/80 border border-accent rounded transition-colors"
                            title="Start build with this sprint's items"
                          >
                            Start Build
                          </button>
                          <button
                            onClick={() => setSprintStatus(sprint.id, 'completed')}
                            className="px-2.5 py-1 text-xs font-bold text-spectrum-green hover:bg-spectrum-green/10 border border-spectrum-green/30 rounded transition-colors"
                            title="Complete this sprint"
                          >
                            Complete Sprint
                          </button>
                        </>
                      )}
                      <label
                        className="p-1 text-ink-muted hover:text-mc-amber transition-colors cursor-pointer"
                        title={sprint.deadline ? `Deadline: ${new Date(sprint.deadline).toLocaleDateString()}` : 'Set deadline'}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <input
                          type="date"
                          className="sr-only"
                          value={sprint.deadline ? sprint.deadline.slice(0, 10) : ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateSprint(sprint.id, { deadline: val ? new Date(val + 'T23:59:59').toISOString() : undefined });
                          }}
                        />
                      </label>
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
                      <span className="text-sm text-ink-muted">Empty sprint — assign items from the backlog</span>
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
                        <div key={item.id} className="px-5 py-3 flex items-center gap-3 transition-all duration-150 hover:bg-accent/5">
                          <StatusLight status={derivedStatus} size="sm" />
                          <span className={`text-[14px] font-display font-bold capitalize px-2 py-0.5 border rounded ${priorityColors[item.priority] || priorityColors.low}`}>
                            {item.priority}
                          </span>
                          {/* Per-item planning status */}
                          {item.prdStatus === 'generating' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-spectrum-yellow">
                              <span className="w-3 h-3 border-2 border-spectrum-yellow border-t-transparent rounded-full animate-spin" />
                              Planning
                            </span>
                          ) : item.prdStatus === 'complete' ? (
                            <span className="text-[11px] font-medium px-1.5 py-0.5 bg-spectrum-green/15 text-spectrum-green border border-spectrum-green/30 rounded">
                              Planned
                            </span>
                          ) : item.prdStatus === 'failed' ? (
                            <button
                              onClick={() => generateBacklogPRD(item.id)}
                              className="text-[11px] font-medium px-1.5 py-0.5 bg-spectrum-red/15 text-spectrum-red border border-spectrum-red/30 rounded hover:bg-spectrum-red/25 transition-colors"
                            >
                              Failed — Retry
                            </button>
                          ) : (
                            <span className="text-[11px] font-medium text-ink-muted/60">
                              Unplanned
                            </span>
                          )}
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
                      <StatusLight status="todo" size="sm" />
                      <span className={`text-[13px] font-display font-semibold capitalize px-1.5 py-0.5 border ${priorityColors[item.priority] || priorityColors.low}`}>
                        {item.priority}
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

            {/* Completed sprints */}
            {completedSprints.length > 0 && (
              <details className="group">
                <summary className="cursor-pointer text-sm text-ink-muted hover:text-ink transition-colors flex items-center gap-2 py-2">
                  <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  Completed ({completedSprints.length})
                </summary>
                <div className="space-y-4 mt-2">
                  {completedSprints.map((sprint) => {
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
                                <StatusLight status="done" size="sm" />
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
      <div className="segmented-control mb-4">
        {(['planning', 'backlog', 'roadmap'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setPlanSubTab(tab)}
            className={`segmented-control-item ${
              planSubTab === tab ? 'segmented-control-item-active' : ''
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
      <div className="segmented-control mb-4">
        {(['commits', 'deploys'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setShipSubTab(tab)}
            className={`segmented-control-item ${
              shipSubTab === tab ? 'segmented-control-item-active' : ''
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
              {currentProject.scanStatus ? (
                <span className={`px-2 py-0.5 text-xs font-medium ${
                  currentProject.scanStatus === 'complete' ? 'bg-spectrum-green/20 text-spectrum-green' :
                  currentProject.scanStatus === 'scanning' ? 'bg-accent/20 text-accent' :
                  currentProject.scanStatus === 'failed' ? 'bg-spectrum-red/20 text-spectrum-red' :
                  'bg-surface-light text-ink-muted'
                }`}>
                  {currentProject.scanStatus === 'complete' ? 'Active' :
                   currentProject.scanStatus === 'scanning' ? 'Scanning' :
                   currentProject.scanStatus === 'failed' ? 'Scan Failed' : 'Pending'}
                </span>
              ) : currentProject.status ? (
                <span className={`px-2 py-0.5 text-xs font-medium ${statusColor[currentProject.status]}`}>
                  {statusLabel[currentProject.status]}
                </span>
              ) : (
                <span className="px-2 py-0.5 text-xs font-medium bg-surface-light text-ink-muted">Unknown</span>
              )}
            </p>
          </div>
          {currentProject.githubRepo && (
            <div>
              <label className="text-sm font-sans font-medium text-ink-muted">GitHub</label>
              <p className="text-sm text-accent mt-1 break-all">{currentProject.githubRepo}</p>
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
