import { useMemo } from 'react';
import type { Task, TaskPhase } from '../types';

interface KanbanBoardProps {
  tasks: Task[];
  currentTaskId?: string | null;
  taskPhase?: TaskPhase;
}

interface KanbanColumn {
  id: 'todo' | 'in-progress' | 'done';
  title: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const COLUMNS: KanbanColumn[] = [
  {
    id: 'todo',
    title: 'To Do',
    color: 'text-ink-secondary',
    bgColor: 'bg-surface',
    borderColor: 'border-border',
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    color: 'text-spectrum-blue',
    bgColor: 'bg-spectrum-blue/10',
    borderColor: 'border-spectrum-blue/30',
  },
  {
    id: 'done',
    title: 'Done',
    color: 'text-success',
    bgColor: 'bg-success/10',
    borderColor: 'border-success/30',
  },
];

const PHASE_LABELS: Partial<Record<TaskPhase, string>> = {
  branching: 'Creating branch...',
  building: 'Building...',
  committing: 'Committing...',
  reviewing: 'Reviewing...',
  fixing: 'Auto-fixing...',
  merging: 'Merging...',
  pushing: 'Pushing...',
};

const CHECKPOINT_LABELS: Record<string, string> = {
  branched: 'Paused at branched',
  built: 'Paused at built',
  reviewed: 'Paused at reviewed',
};

export default function KanbanBoard({ tasks, currentTaskId, taskPhase }: KanbanBoardProps) {
  // Organize tasks into columns
  const columns = useMemo(() => {
    const todoTasks: Task[] = [];
    const inProgressTasks: Task[] = [];
    const doneTasks: Task[] = [];

    tasks.forEach((task) => {
      if (task.completed) {
        doneTasks.push(task);
      } else if (task.id === currentTaskId) {
        inProgressTasks.push(task);
      } else if (task.buildPhase && task.buildPhase !== 'merged') {
        // Has checkpoint progress but not actively building — paused
        inProgressTasks.push(task);
      } else {
        todoTasks.push(task);
      }
    });

    return {
      todo: todoTasks,
      'in-progress': inProgressTasks,
      done: doneTasks,
    };
  }, [tasks, currentTaskId]);

  return (
    <div className="flex gap-4 h-full min-h-0">
      {COLUMNS.map((column) => (
        <div
          key={column.id}
          className={`flex-1 flex flex-col min-w-0 border ${column.borderColor} ${column.bgColor}`}
        >
          {/* Column Header */}
          <div className={`px-3 py-2 border-b ${column.borderColor}`}>
            <div className="flex items-center justify-between">
              <h3 className={`text-base font-sans font-semibold ${column.color}`}>{column.title}</h3>
              <span className={`font-display uppercase tracking-wider text-[13px] px-2 py-0.5 ${column.bgColor} ${column.color}`}>
                {columns[column.id].length}
              </span>
            </div>
          </div>

          {/* Column Content */}
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {columns[column.id].map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                isActive={task.id === currentTaskId}
                isPaused={!task.completed && task.id !== currentTaskId && !!task.buildPhase && task.buildPhase !== 'merged'}
                columnId={column.id}
                taskPhase={task.id === currentTaskId ? taskPhase : undefined}
              />
            ))}

            {/* Empty state */}
            {columns[column.id].length === 0 && (
              <div className="text-center py-8 text-ink-muted text-sm">
                {column.id === 'todo' && 'All tasks started!'}
                {column.id === 'in-progress' && 'Waiting...'}
                {column.id === 'done' && 'No completed tasks yet'}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

interface TaskCardProps {
  task: Task;
  isActive: boolean;
  isPaused: boolean;
  columnId: string;
  taskPhase?: TaskPhase;
}

function TaskCard({ task, isActive, isPaused, columnId, taskPhase }: TaskCardProps) {
  const phaseLabel = taskPhase ? PHASE_LABELS[taskPhase] : undefined;
  const pausedLabel = isPaused && task.buildPhase ? CHECKPOINT_LABELS[task.buildPhase] : undefined;

  return (
    <div
      className={`
        card-panel p-3 transition-all duration-200
        ${isActive ? 'border-spectrum-green ring-2 ring-spectrum-green/20' : ''}
        ${isPaused ? 'border-spectrum-blue/40' : ''}
        ${columnId === 'done' ? 'opacity-75' : ''}
        animate-in fade-in slide-in-from-left-2
      `}
    >
      <div className="flex items-start gap-2">
        {/* Status indicator */}
        <div className="flex-shrink-0 mt-0.5">
          {columnId === 'done' ? (
            <svg className="w-4 h-4 text-success" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          ) : isActive ? (
            <div className="w-4 h-4 border-4 border-spectrum-green border-t-transparent animate-spin" />
          ) : isPaused ? (
            <div className="w-4 h-4 bg-spectrum-blue rounded-full" />
          ) : (
            <div className="w-4 h-4 border-2 border-border" />
          )}
        </div>

        {/* Task title */}
        <span
          className={`text-sm leading-tight ${
            columnId === 'done' ? 'text-ink-muted line-through' : 'text-ink'
          }`}
        >
          {task.title}
        </span>
      </div>

      {/* Active indicator with phase label */}
      {isActive && (
        <div className="mt-2 flex items-center gap-1 text-xs text-spectrum-green">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full bg-amber opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 bg-spectrum-green"></span>
          </span>
          {phaseLabel || 'Building...'}
        </div>
      )}

      {/* Paused indicator with checkpoint label */}
      {isPaused && pausedLabel && (
        <div className="mt-2 flex items-center gap-1 text-xs text-spectrum-blue">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex h-2 w-2 bg-spectrum-blue rounded-full"></span>
          </span>
          {pausedLabel}
        </div>
      )}
    </div>
  );
}
