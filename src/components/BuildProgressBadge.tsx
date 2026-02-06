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
  const isBuilding = taskPhase === 'building' || taskPhase === 'branching' ||
                     taskPhase === 'committing' || taskPhase === 'reviewing' ||
                     taskPhase === 'fixing' || taskPhase === 'merging' ||
                     taskPhase === 'pushing';

  return (
    <div className="flex items-center gap-2">
      {/* Pulsing indicator when actively building */}
      {isBuilding && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-terracotta-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-terracotta-500"></span>
        </span>
      )}
      {!isBuilding && currentTaskId && (
        <span className="w-2 h-2 rounded-full bg-charcoal-400"></span>
      )}
      {!isBuilding && !currentTaskId && completedTasks === tasks.length && tasks.length > 0 && (
        <span className="w-2 h-2 rounded-full bg-sage-500"></span>
      )}
      <span className="text-sm">
        Build ({completedTasks}/{tasks.length})
      </span>
    </div>
  );
}
