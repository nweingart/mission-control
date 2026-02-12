import type { Task, TaskPhase } from '../types';

interface BuildProgressBadgeProps {
  tasks: Task[];
  currentTaskId: string | null;
  taskPhase: TaskPhase;
  onClick?: () => void;
}

export default function BuildProgressBadge({
  tasks,
  currentTaskId,
  taskPhase,
  onClick,
}: BuildProgressBadgeProps) {
  const completedTasks = tasks.filter((t) => t.completed).length;
  const activeTasks = completedTasks + (currentTaskId ? 1 : 0);
  const isBuilding = taskPhase === 'building' || taskPhase === 'branching' ||
                     taskPhase === 'committing' || taskPhase === 'reviewing' ||
                     taskPhase === 'fixing' || taskPhase === 'merging' ||
                     taskPhase === 'pushing';

  return (
    <div className="flex items-center gap-2">
      {/* Pulsing indicator when actively building */}
      {isBuilding && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full bg-spectrum-orange opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 bg-spectrum-orange"></span>
        </span>
      )}
      {!isBuilding && currentTaskId && (
        <span className="w-2 h-2 bg-ink-muted/30"></span>
      )}
      {!isBuilding && !currentTaskId && completedTasks === tasks.length && tasks.length > 0 && (
        <span className="w-2 h-2 bg-success"></span>
      )}
      <span className="text-[13px] font-display uppercase tracking-wider">
        Build ({activeTasks}/{tasks.length})
      </span>
    </div>
  );
}
