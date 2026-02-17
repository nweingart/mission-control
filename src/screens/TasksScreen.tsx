import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import TaskList from '../components/TaskList';
import { resilientChat } from '../utils/resilient-chat';
import { computeTierPlan, assignTiers } from '../utils/dag-scheduler';
import type { HumanTask, Task } from '../types';

const DEFAULT_TASKS = [
  'Set up Next.js project with TypeScript and Tailwind CSS',
  'Configure database client and authentication',
  'Create database schema and migrations',
  'Build authentication UI (login/signup pages)',
  'Implement main feature components',
  'Add CRUD operations',
  'Style the application with Tailwind',
  'Add error handling and loading states',
  'Test the complete flow',
  'Prepare for deployment',
];

export default function TasksScreen() {
  const {
    currentProject,
    tasks,
    setTasks,
    addTask,
    updateTask,
    removeTask,
    reorderTasks,
    updateProject,
    goToHome,
    goToDiscovery,
    goToBuilding,
  } = useAppStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [usedDefaultTasks, setUsedDefaultTasks] = useState(false);
  const [humanTasks, setHumanTasks] = useState<HumanTask[]>(currentProject?.humanTasks ?? []);
  const hasAttemptedGenerate = useRef(false);
  const isMountedRef = useRef(true);

  // Track mounted state to prevent updates after unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Helper to check if current tasks differ from defaults (user modified them)
  const areTasksModified = useCallback(() => {
    if (tasks.length !== DEFAULT_TASKS.length) return true;
    const defaultTitles = new Set(DEFAULT_TASKS);
    return tasks.some(t => !defaultTitles.has(t.title));
  }, [tasks]);

  const generateTasks = useCallback(async () => {
    if (!currentProject) return;

    setIsGenerating(true);
    setGenerateError(null);

    try {
      // Get PRD for context
      const prd = await window.api.storage.getPRD(currentProject.slug);

      // Check if still mounted
      if (!isMountedRef.current) return;

      if (prd) {
        // Use Claude to generate tasks based on PRD
        const prompt = `You are helping to break down a software project into buildable tasks.

## Project: ${currentProject.name}

## PRD:
${prd}

Break this into the smallest reasonable development tasks. Guidelines:
- Simple projects (landing page, CRUD app): 5-8 tasks
- Medium projects (auth + multiple features): 10-15 tasks
- Complex projects (multi-role, integrations, real-time): 15-25 tasks
- Each task should be ONE focused unit that an AI can complete in under 4 minutes — no compound tasks
- BAD: "Build auth flow with signup, login, logout and onboarding screen"
- GOOD: "Set up auth client", "Build signup page", "Build login page", "Add logout to navbar", "Create onboarding screen"
- Tasks must build on each other logically

Additionally, identify any setup tasks that require HUMAN action outside the codebase
(creating accounts, enabling auth providers, getting API keys, configuring OAuth, etc.).

Return your response as a JSON object with two arrays:
{
  "tasks": [
    {
      "title": "...",
      "description": "1-2 sentence detail",
      "estimatedMinutes": 3,
      "creates": ["src/components/Auth.tsx", "src/hooks/useAuth.ts"],
      "modifies": ["src/app/layout.tsx"],
      "dependsOn": [0]
    }
  ],
  "humanTasks": [
    {
      "title": "Add Supabase credentials",
      "description": "Get the Project URL and anon key from your Supabase dashboard and add them to .env.local",
      "service": "supabase",
      "blocksPreview": true,
      "links": [
        {"label": "Supabase API Settings", "url": "https://supabase.com/dashboard/project/_/settings/api"}
      ],
      "verification": {"type": "env_var_check", "envVars": ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]}
    }
  ]
}

For each task, also include:
- "creates": array of file paths this task will create (new files only)
- "modifies": array of existing file paths this task will change
- "dependsOn": array of task indices (0-based) that must complete before this task can start. Only include direct dependencies — if task 3 depends on task 1, and task 2 also depends on task 1, task 3 does NOT need to list task 1 unless it directly needs task 1's output.

File path guidelines:
- Use project-relative paths (e.g., "src/components/Auth.tsx", not absolute paths)
- Do NOT include package.json, lock files, or config files (tsconfig, tailwind.config, etc.) — these are handled separately
- Focus on source files your task will directly create or edit

If there are no human tasks needed, return an empty humanTasks array.
estimatedMinutes should be 1-4 for each task (aim for under 4 minutes each).

Do not include any other text, just the JSON object.`;

        const { promise } = resilientChat.standard(currentProject.projectPath, prompt);
        const response = await promise;

        // Check if still mounted
        if (!isMountedRef.current) return;

        // Parse the JSON response
        try {
          // Try to parse as { tasks, humanTasks } object first
          const objMatch = response.match(/\{[\s\S]*\}/);
          const arrMatch = response.match(/\[[\s\S]*\]/);

          let taskArray: unknown[] | null = null;
          let humanTaskArray: unknown[] | null = null;

          if (objMatch) {
            try {
              const obj = JSON.parse(objMatch[0]);
              if (obj && typeof obj === 'object' && Array.isArray(obj.tasks)) {
                taskArray = obj.tasks;
                if (Array.isArray(obj.humanTasks)) {
                  humanTaskArray = obj.humanTasks;
                }
              }
            } catch {
              // Not a valid object — fall through to array parse
            }
          }

          // Fallback: plain JSON array (backward compat)
          if (!taskArray && arrMatch) {
            const parsed = JSON.parse(arrMatch[0]);
            if (Array.isArray(parsed)) {
              taskArray = parsed;
            }
          }

          if (taskArray) {
            // Handle both {title, description, estimatedMinutes} objects and plain strings
            const generatedTasks = taskArray
              .map((item: unknown, index: number) => {
                if (typeof item === 'string' && item.trim().length > 0) {
                  return { id: `task-${Date.now()}-${index}`, title: item.trim(), completed: false };
                }
                if (item && typeof item === 'object' && 'title' in item) {
                  const obj = item as Record<string, unknown>;
                  if (typeof obj.title === 'string' && (obj.title as string).trim().length > 0) {
                    return {
                      id: `task-${Date.now()}-${index}`,
                      title: (obj.title as string).trim(),
                      description: typeof obj.description === 'string' ? obj.description.trim() : undefined,
                      estimatedMinutes: typeof obj.estimatedMinutes === 'number' ? obj.estimatedMinutes : undefined,
                      creates: Array.isArray(obj.creates) ? obj.creates.filter((f: unknown) => typeof f === 'string') : undefined,
                      modifies: Array.isArray(obj.modifies) ? obj.modifies.filter((f: unknown) => typeof f === 'string') : undefined,
                      _rawDependsOn: Array.isArray(obj.dependsOn) ? obj.dependsOn.filter((d: unknown) => typeof d === 'number') : undefined,
                      completed: false,
                    };
                  }
                }
                return null;
              })
              .filter((t: unknown): t is NonNullable<typeof t> => t !== null)
              .slice(0, 30);

            if (generatedTasks.length === 0) {
              throw new Error('No valid tasks found in response');
            }

            // Convert index-based dependsOn from Claude to task-ID-based
            const withDeps = generatedTasks.map((task: Record<string, unknown>, idx: number) => {
              const rawDeps = (task as Record<string, unknown>)._rawDependsOn as number[] | undefined;
              const { _rawDependsOn: _, ...cleanTask } = task as Record<string, unknown>;
              if (Array.isArray(rawDeps)) {
                const depIds = rawDeps
                  .filter((d: number) => d >= 0 && d < generatedTasks.length && d !== idx)
                  .map((d: number) => (generatedTasks[d] as Record<string, unknown>).id as string);
                return { ...cleanTask, dependsOn: depIds.length > 0 ? depIds : undefined };
              }
              return cleanTask;
            });

            // Assign tiers from the DAG
            const tiered = assignTiers(withDeps as Task[]);
            setTasks(tiered);

            // Parse and save human tasks
            if (humanTaskArray && humanTaskArray.length > 0) {
              const now = Date.now();
              const parsedHumanTasks: HumanTask[] = humanTaskArray
                .map((item: unknown, index: number) => {
                  if (!item || typeof item !== 'object' || !('title' in item)) return null;
                  const ht = item as Record<string, unknown>;
                  return {
                    id: `human-task-${now}-${index}`,
                    title: String(ht.title || ''),
                    description: String(ht.description || ''),
                    service: typeof ht.service === 'string' ? ht.service : undefined,
                    status: 'pending' as const,
                    blocksPreview: Boolean(ht.blocksPreview),
                    links: Array.isArray(ht.links) ? ht.links.filter(
                      (l: unknown): l is { label: string; url: string } =>
                        !!l && typeof l === 'object' && 'label' in l && 'url' in l
                    ) : undefined,
                    verification: ht.verification && typeof ht.verification === 'object' && 'type' in (ht.verification as Record<string, unknown>)
                      ? {
                          type: 'env_var_check' as const,
                          envVars: Array.isArray((ht.verification as Record<string, unknown>).envVars)
                            ? ((ht.verification as Record<string, unknown>).envVars as string[])
                            : [],
                        }
                      : undefined,
                  };
                })
                .filter((t): t is HumanTask => t !== null && t.title.length > 0);

              if (parsedHumanTasks.length > 0) {
                setHumanTasks(parsedHumanTasks);
                updateProject({ humanTasks: parsedHumanTasks });
              }
            }

            if (isMountedRef.current) {
              setIsGenerating(false);
            }
            return;
          }
        } catch (parseError) {
          console.error('Failed to parse Claude response:', parseError);
          // Fall through to default tasks
        }
      }

      // Check if still mounted before fallback
      if (!isMountedRef.current) return;

      // Fallback to default tasks if no PRD or parsing failed
      const generatedTasks = DEFAULT_TASKS.map((title, index) => ({
        id: `task-${Date.now()}-${index}`,
        title,
        completed: false,
      }));

      setTasks(generatedTasks);
      setUsedDefaultTasks(true);
    } catch (err) {
      // Check if still mounted
      if (!isMountedRef.current) return;

      console.error('Failed to generate tasks:', err);
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate tasks');

      // Fall back to default tasks on error
      const generatedTasks = DEFAULT_TASKS.map((title, index) => ({
        id: `task-${Date.now()}-${index}`,
        title,
        completed: false,
      }));

      setTasks(generatedTasks);
      setUsedDefaultTasks(true);
      useAppStore.getState().addToast({
        type: 'warning',
        message: 'Could not generate custom tasks. Using defaults — you can edit them below.',
      });
    } finally {
      if (isMountedRef.current) {
        setIsGenerating(false);
      }
    }
  }, [currentProject, setTasks]);

  useEffect(() => {
    // Generate tasks if none exist (only attempt once)
    if (tasks.length === 0 && !hasAttemptedGenerate.current) {
      hasAttemptedGenerate.current = true;
      generateTasks();
    }
  }, [tasks.length, generateTasks]);

  const handleTaskToggle = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      updateTask(id, { completed: !task.completed });
    }
  };

  const handleTaskRemove = (id: string) => {
    removeTask(id);
  };

  const handleTaskAdd = (title: string) => {
    addTask(title);
  };

  const handleTasksReorder = (newTasks: typeof tasks) => {
    // Recompute tiers after reorder
    const tiered = assignTiers(newTasks);
    reorderTasks(tiered);
  };

  const handleTaskEdit = (id: string, title: string) => {
    updateTask(id, { title });
  };

  const handleStartBuilding = async () => {
    await updateProject({ status: 'building' });
    goToBuilding();
  };

  // Compute tier plan from current tasks (recomputes when tasks change)
  const tierPlan = useMemo(() => {
    if (tasks.length === 0) return null;
    return computeTierPlan(tasks);
  }, [tasks]);

  const hasManifests = useMemo(() => {
    return tasks.some(t => t.creates !== undefined || t.modifies !== undefined);
  }, [tasks]);

  const [expandedTier, setExpandedTier] = useState<number | null>(null);

  const handleRegenerateTasks = () => {
    // Warn if tasks have been modified by user
    if (tasks.length > 0 && areTasksModified()) {
      const confirmed = window.confirm(
        'You have modified the task list. Regenerating will replace all tasks. Are you sure you want to continue?'
      );
      if (!confirmed) return;
    }

    hasAttemptedGenerate.current = false;
    setTasks([]);
    setGenerateError(null);
    setUsedDefaultTasks(false);
    generateTasks();
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-surface-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={goToDiscovery}
              className="text-ink-muted hover:text-ink transition-colors no-drag"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-xl font-sans font-bold text-ink">{currentProject?.name}</h1>
              <p className="text-ink-muted text-sm">Planning Phase - Review and edit tasks</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-ink-muted">Step 2 of 4</span>
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-accent"></div>
              <div className="w-2 h-2 bg-accent"></div>
              <div className="w-2 h-2 bg-border"></div>
              <div className="w-2 h-2 bg-border"></div>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 border-4 border-accent border-t-transparent animate-spin mb-4"></div>
              <p className="text-ink-secondary">Generating task breakdown...</p>
              <p className="text-sm text-ink-muted mt-1">Analyzing your PRD to create actionable tasks</p>
            </div>
          ) : (
            <>
              {/* Warning when using default tasks */}
              {(generateError || usedDefaultTasks) && (
                <div className="bg-accent/10 border border-accent/30 p-4 mb-6">
                  <div className="flex">
                    <svg className="w-5 h-5 text-accent mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div>
                      <h3 className="font-medium text-accent">Using default tasks</h3>
                      <p className="text-sm text-accent mt-1">
                        {generateError
                          ? `Couldn't generate custom tasks (${generateError}). Using default task list instead.`
                          : 'Using generic default tasks. Please review and customize these for your project.'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Info box */}
              <div className="bg-accent/10 border border-accent/30 p-4 mb-6">
                <div className="flex">
                  <svg className="w-5 h-5 text-accent mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div>
                    <h3 className="font-medium text-accent">Review your task list</h3>
                    <p className="text-sm text-accent mt-1">
                      You can reorder, edit, add, or remove tasks. Claude will work through these one by one
                      during the build phase.
                    </p>
                  </div>
                </div>
              </div>

              {/* Task list */}
              <TaskList
                tasks={tasks}
                onTaskToggle={handleTaskToggle}
                onTaskRemove={handleTaskRemove}
                onTaskAdd={handleTaskAdd}
                onTasksReorder={handleTasksReorder}
                onTaskEdit={handleTaskEdit}
                editable={true}
                showAddButton={true}
              />

              {/* Execution Plan (tier preview) */}
              {tierPlan && tierPlan.tiers.length > 0 && hasManifests && (
                <div className="mt-8">
                  <h3 className="text-sm font-sans font-semibold text-ink-muted uppercase tracking-wider mb-3">
                    Execution Plan
                  </h3>
                  <div className="bg-surface border border-border overflow-hidden">
                    {tierPlan.tiers.map((group) => {
                      const tierTasks = group.taskIds
                        .map(id => tasks.find(t => t.id === id))
                        .filter((t): t is Task => t !== undefined);
                      const isExpanded = expandedTier === group.tier;

                      return (
                        <div key={group.tier} className="border-b border-border last:border-b-0">
                          <button
                            onClick={() => setExpandedTier(isExpanded ? null : group.tier)}
                            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-surface-card/50 transition-colors text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-semibold text-accent bg-accent/10 px-1.5 py-0.5">
                                T{group.tier}
                              </span>
                              <span className="text-sm text-ink">
                                {tierTasks.length} {tierTasks.length === 1 ? 'task' : 'tasks'}
                                {tierTasks.length > 1 && (
                                  <span className="text-ink-muted ml-1">(parallel)</span>
                                )}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-ink-muted">~{group.estimatedMin} min</span>
                              <svg
                                className={`w-4 h-4 text-ink-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="px-4 pb-3 space-y-2">
                              {tierTasks.map((task) => (
                                <div key={task.id} className="bg-surface-card border border-border p-3">
                                  <div className="flex items-start gap-2">
                                    <span className="text-xs text-ink-muted font-mono mt-0.5 flex-shrink-0">
                                      {group.taskIds.indexOf(task.id) + 1}.
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-ink">{task.title}</p>
                                      {(task.creates?.length || task.modifies?.length) && (
                                        <div className="mt-1.5 flex flex-wrap gap-1">
                                          {task.creates?.map(f => (
                                            <span key={f} className="text-[10px] font-mono px-1.5 py-0.5 bg-spectrum-green/10 text-spectrum-green">
                                              +{f.split('/').pop()}
                                            </span>
                                          ))}
                                          {task.modifies?.map(f => (
                                            <span key={f} className="text-[10px] font-mono px-1.5 py-0.5 bg-spectrum-blue/10 text-spectrum-blue">
                                              ~{f.split('/').pop()}
                                            </span>
                                          ))}
                                        </div>
                                      )}
                                      {task.dependsOn && task.dependsOn.length > 0 && (
                                        <p className="text-[10px] text-ink-muted mt-1">
                                          depends on: {task.dependsOn.map(depId => {
                                            const dep = tasks.find(t => t.id === depId);
                                            return dep ? `"${dep.title}"` : depId;
                                          }).join(', ')}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Time savings footer */}
                    <div className="px-4 py-2.5 bg-surface-card/50 flex items-center justify-between text-xs text-ink-muted">
                      <span>
                        {tierPlan.tiers.length} {tierPlan.tiers.length === 1 ? 'tier' : 'tiers'} &middot;{' '}
                        ~{tierPlan.estimatedParallelMin} min parallel vs ~{tierPlan.estimatedSequentialMin} min sequential
                      </span>
                      {tierPlan.estimatedSequentialMin > tierPlan.estimatedParallelMin && (
                        <span className="text-spectrum-green font-medium">
                          ~{Math.round(((tierPlan.estimatedSequentialMin - tierPlan.estimatedParallelMin) / tierPlan.estimatedSequentialMin) * 100)}% faster
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-ink-muted mt-2">
                    Tasks in the same tier have no file conflicts and can run in parallel.
                  </p>
                </div>
              )}

              {/* Setup Tasks (human tasks) */}
              {humanTasks.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-sm font-sans font-semibold text-ink-muted uppercase tracking-wider mb-3">
                    Setup Tasks — things you'll do while Houston builds
                  </h3>
                  <div className="space-y-2">
                    {humanTasks.map((ht) => (
                      <div key={ht.id} className="card-panel p-3 flex items-start gap-3">
                        {ht.service && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent flex-shrink-0 mt-0.5">
                            {ht.service}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ink">{ht.title}</p>
                          <p className="text-xs text-ink-muted mt-0.5">{ht.description}</p>
                        </div>
                        {ht.blocksPreview && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-houston-amber/10 text-houston-amber flex-shrink-0 mt-0.5">
                            Required for preview
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-8 flex justify-between items-center">
                <button
                  onClick={handleRegenerateTasks}
                  className="flex items-center space-x-2 px-4 py-2 text-ink-muted hover:text-ink transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  <span>Regenerate Tasks</span>
                </button>

                <button
                  onClick={handleStartBuilding}
                  disabled={tasks.length === 0}
                  className="btn-solid-primary flex items-center space-x-2 px-6 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>Start Building</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 7l5 5m0 0l-5 5m5-5H6"
                    />
                  </svg>
                </button>
              </div>

              {/* Tip */}
              <div className="mt-6 text-center text-sm text-ink-muted">
                Tip: Double-click a task to edit it. Drag to reorder.
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
