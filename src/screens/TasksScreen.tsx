import { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';
import TaskList from '../components/TaskList';

const DEFAULT_TASKS = [
  'Set up Next.js project with TypeScript and Tailwind CSS',
  'Configure Supabase client and authentication',
  'Create database schema and migrations',
  'Build authentication UI (login/signup pages)',
  'Implement main feature components',
  'Add CRUD operations with Supabase',
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

Please generate a list of 8-12 specific, actionable development tasks to build this project. Each task should:
1. Be completable in a single coding session
2. Build on previous tasks logically
3. Be specific enough for an AI to implement

Return ONLY a JSON array of task titles, like this:
["Task 1 title", "Task 2 title", ...]

Do not include any other text, just the JSON array.`;

        const response = await window.api.claude.chat(currentProject.projectPath, prompt);

        // Check if still mounted
        if (!isMountedRef.current) return;

        // Parse the JSON response
        try {
          // Find JSON array in response (Claude might include extra text)
          const jsonMatch = response.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            // Validate parsed result is an array of strings
            if (!Array.isArray(parsed)) {
              throw new Error('Parsed result is not an array');
            }

            // Filter to valid strings and limit to 20 tasks max
            const taskTitles = parsed
              .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
              .slice(0, 20);

            if (taskTitles.length === 0) {
              throw new Error('No valid tasks found in response');
            }

            const generatedTasks = taskTitles.map((title, index) => ({
              id: `task-${Date.now()}-${index}`,
              title: title.trim(),
              completed: false,
            }));

            setTasks(generatedTasks);
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
    reorderTasks(newTasks);
  };

  const handleTaskEdit = (id: string, title: string) => {
    updateTask(id, { title });
  };

  const handleStartBuilding = async () => {
    await updateProject({ status: 'building' });
    goToBuilding();
  };

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
