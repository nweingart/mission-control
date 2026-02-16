import type { Project } from '../types';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onDelete?: () => void;
}

export default function ProjectCard({ project, onClick, onDelete }: ProjectCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'idea':
        return 'bg-spectrum-blue/15 text-spectrum-blue border border-spectrum-blue/25';
      case 'discovery':
        return 'bg-spectrum-purple/15 text-spectrum-purple border border-spectrum-purple/25';
      case 'planning':
        return 'bg-spectrum-yellow/15 text-spectrum-yellow border border-spectrum-yellow/25';
      case 'building':
        return 'bg-spectrum-orange/15 text-spectrum-orange border border-spectrum-orange/25';
      case 'deploying':
        return 'bg-spectrum-blue/15 text-spectrum-blue border border-spectrum-blue/25';
      case 'complete':
        return 'bg-spectrum-green/15 text-spectrum-green border border-spectrum-green/25';
      default:
        return 'bg-border/50 text-ink-secondary border border-border';
    }
  };

  const getStatusLeftBorder = (status: string) => {
    switch (status) {
      case 'idea': return '#5B9EC9';
      case 'discovery': return '#5B9EC9';
      case 'planning': return '#E0A030';
      case 'building': return '#5B9EC9';
      case 'deploying': return '#E0A030';
      case 'complete': return '#4ADE80';
      default: return '#2A3444';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'idea':
        return 'Idea';
      case 'discovery':
        return 'Discovery';
      case 'planning':
        return 'Planning';
      case 'building':
        return 'Building';
      case 'deploying':
        return 'Deploying';
      case 'complete':
        return 'Complete';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) {
      return 'Unknown date';
    }
    const date = new Date(dateString);
    // Check for invalid date
    if (isNaN(date.getTime())) {
      return 'Unknown date';
    }
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.();
  };

  return (
    <div
      onClick={onClick}
      className="card-panel p-5 transition-all cursor-pointer group overflow-hidden"
      style={{ borderLeft: `4px solid ${getStatusLeftBorder(project.status)}` }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-sans font-semibold text-ink truncate">{project.name}</h3>
          <p className="text-sm text-ink-muted mt-1 line-clamp-2">
            {project.idea || 'No description'}
          </p>
        </div>

        {/* Delete button */}
        {onDelete && (
          <button
            onClick={handleDelete}
            className="ml-2 p-1 text-ink-muted hover:text-error opacity-0 group-hover:opacity-100 transition-all"
            title="Delete project"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        )}
      </div>

      <div className="flex items-center justify-between mt-4">
        <span
          className={`font-display font-bold text-[14px] px-2.5 py-1 rounded ${getStatusColor(project.status)}`}
        >
          {getStatusLabel(project.status)}
        </span>
        <span className="text-xs text-ink-muted">{formatDate(project.createdAt)}</span>
      </div>

    </div>
  );
}
