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
    color: 'text-charcoal-200',
    bgColor: 'bg-charcoal-700',
    borderColor: 'border-charcoal-600',
  },
  {
    id: 'in-progress',
    title: 'In Progress',
    color: 'text-terracotta-500',
    bgColor: 'bg-terracotta-500/10',
    borderColor: 'border-terracotta-500/30',
  },
  {
    id: 'done',
    title: 'Done',
    color: 'text-sage-500',
    bgColor: 'bg-sage-500/10',
    borderColor: 'border-sage-500/30',
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
          className={`flex-1 flex flex-col min-w-0 rounded-lg border ${column.borderColor} ${column.bgColor}`}
        >
          {/* Column Header */}
          <div className={`px-3 py-2 border-b ${column.borderColor}`}>
            <div className="flex items-center justify-between">
              <h3 className={`font-semibold text-sm ${column.color}`}>{column.title}</h3>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${column.bgColor} ${column.color}`}>
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
                columnId={column.id}
                taskPhase={task.id === currentTaskId ? taskPhase : undefined}
              />
            ))}

            {/* Empty state */}
            {columns[column.id].length === 0 && (
              <div className="text-center py-8 text-charcoal-400 text-sm">
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
  columnId: string;
  taskPhase?: TaskPhase;
}

function TaskCard({ task, isActive, columnId, taskPhase }: TaskCardProps) {
  const phaseLabel = taskPhase ? PHASE_LABELS[taskPhase] : undefined;

  return (
    <div
      className={`
        p-3 rounded-lg bg-charcoal-800 shadow-sm border transition-all duration-200
        ${isActive ? 'border-terracotta-500 ring-2 ring-terracotta-500/20' : 'border-charcoal-600'}
        ${columnId === 'done' ? 'opacity-75' : ''}
        animate-in fade-in slide-in-from-left-2
      `}
    >
      <div className="flex items-start gap-2">
        {/* Status indicator */}
        <div className="flex-shrink-0 mt-0.5">
          {columnId === 'done' ? (
            <svg className="w-4 h-4 text-sage-500" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          ) : isActive ? (
            <svg className="w-4 h-4 text-terracotta-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <div className="w-4 h-4 rounded-full border-2 border-charcoal-500" />
          )}
        </div>

        {/* Task title */}
        <span
          className={`text-sm leading-tight ${
            columnId === 'done' ? 'text-charcoal-400 line-through' : 'text-charcoal-100'
          }`}
        >
          {task.title}
        </span>
      </div>

      {/* Active indicator with phase label */}
      {isActive && (
        <div className="mt-2 flex items-center gap-1 text-xs text-terracotta-500">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-terracotta-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-terracotta-500"></span>
          </span>
          {phaseLabel || 'Building...'}
        </div>
      )}
    </div>
  );
}
