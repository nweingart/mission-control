import ReactMarkdown from 'react-markdown';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import StatusLight from './StatusLight';
import { docComponents } from '../utils/markdown-components';
import type { BacklogItem, Sprint, PlanningType } from '../types';
import type { BacklogStatus } from '../utils/backlogStatus';

export const statusBadgeColors: Record<BacklogStatus, string> = {
  todo: 'bg-surface-light text-ink-muted border-border',
  in_progress: 'bg-spectrum-orange/20 text-spectrum-orange border-spectrum-orange/30',
  done: 'bg-accent/20 text-accent border-accent/30',
};

export const statusBadgeLabels: Record<BacklogStatus, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  done: 'Done',
};

export const statusLeftBorder: Record<BacklogStatus, string> = {
  todo: 'border-l-ink-muted/20',
  in_progress: 'border-l-accent',
  done: 'border-l-spectrum-green',
};

export const priorityColors: Record<string, string> = {
  high: 'bg-spectrum-orange/15 text-spectrum-orange border-spectrum-orange/30',
  medium: 'bg-spectrum-yellow/15 text-spectrum-yellow border-spectrum-yellow/30',
  low: 'bg-accent/15 text-accent border-accent/30',
};

export const typeColors: Record<PlanningType, string> = {
  bug_fix: 'bg-spectrum-red/20 text-spectrum-red border-spectrum-red/30',
  feature_refactor: 'bg-accent/20 text-accent border-accent/30',
  new_feature: 'bg-spectrum-purple/20 text-spectrum-purple border-spectrum-purple/30',
};

export const typeLabels: Record<PlanningType, string> = {
  bug_fix: 'Bug',
  feature_refactor: 'Refactor',
  new_feature: 'New Feature',
};

export default function SortableRoadmapCard({ item, index, isExpanded, onToggle, derivedStatus, onNotesChange, onRemove, sprints, onSprintAssign, onPlanAndSprint, isPlanAndSprinting }: { item: BacklogItem; index: number; isExpanded: boolean; onToggle: () => void; derivedStatus: BacklogStatus; onNotesChange: (notes: string) => void; onRemove: () => void; sprints: Sprint[]; onSprintAssign: (sprintId: string | undefined) => void; onPlanAndSprint?: () => void; isPlanAndSprinting?: boolean }) {
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
        className={`card-panel border-l-[3px] transition-all duration-200 overflow-hidden hover:shadow-md hover:border-accent/30 ${statusLeftBorder[derivedStatus]} ${
          isDragging ? 'border-accent/50 shadow-lg scale-[1.01]' : ''
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
                <StatusLight status={derivedStatus} />
                {item.type && (
                  <span className={`text-[14px] font-display font-bold px-2 py-0.5 border rounded ${typeColors[item.type]}`}>
                    {typeLabels[item.type]}
                  </span>
                )}
              </div>
              <h3 className="text-[15px] font-bold text-ink">{item.title}</h3>
              <p className="text-xs text-ink-secondary mt-1 line-clamp-2">{item.description}</p>

              {/* Stats row — readouts */}
              <div className="flex items-center gap-2 mt-3">
                {item.estimatedTasks != null && (
                  <span className="readout">{item.estimatedTasks} tasks</span>
                )}
                {item.storyPoints != null && (
                  <span className="readout">{item.storyPoints} SP</span>
                )}
                {item.prdStatus === 'complete' && (
                  <span className="readout readout-success">Plan Ready</span>
                )}
                {!item.sprintId && onPlanAndSprint && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onPlanAndSprint(); }}
                    disabled={isPlanAndSprinting}
                    className="btn-solid-primary px-2.5 py-1 text-[11px] font-bold disabled:opacity-50 flex items-center gap-1.5 ml-auto"
                  >
                    {isPlanAndSprinting ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white border-t-transparent animate-spin rounded-full" />
                        Planning...
                      </>
                    ) : (
                      'Plan & Sprint'
                    )}
                  </button>
                )}
                {sprints.length > 0 && (
                  <select
                    value={item.sprintId || ''}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => { e.stopPropagation(); onSprintAssign(e.target.value || undefined); }}
                    className={`input-inset text-xs border border-border px-1.5 py-1 bg-surface text-ink cursor-pointer ${!item.sprintId && onPlanAndSprint ? '' : 'ml-auto'}`}
                  >
                    <option value="">Unassigned</option>
                    {sprints.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
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
              <p className="text-sm text-ink-muted italic">No plan generated yet.</p>
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

            {/* Remove */}
            <div className="flex justify-end pt-2 border-t border-border">
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(); }}
                className="text-xs text-ink-muted hover:text-spectrum-red transition-colors flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Remove from backlog
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
