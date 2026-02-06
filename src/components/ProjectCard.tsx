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
        return 'bg-charcoal-600 text-charcoal-200';
      case 'discovery':
        return 'bg-terracotta-500/15 text-terracotta-400';
      case 'planning':
        return 'bg-terracotta-500/15 text-terracotta-400';
      case 'building':
        return 'bg-terracotta-500/10 text-terracotta-500';
      case 'deploying':
        return 'bg-terracotta-500/10 text-terracotta-500';
      case 'complete':
        return 'bg-sage-500/15 text-sage-400';
      default:
        return 'bg-charcoal-600 text-charcoal-200';
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
    if (onDelete && confirm(`Are you sure you want to delete "${project.name}"?\n\nThis will also delete all generated code files.`)) {
      onDelete();
    }
  };

  return (
    <div
      onClick={onClick}
      className="bg-charcoal-800 rounded-lg border border-charcoal-700 p-4 hover:border-terracotta-500/40 hover:shadow-md transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-cream-100 truncate">{project.name}</h3>
          <p className="text-sm text-charcoal-400 mt-1 line-clamp-2">
            {project.idea || 'No description'}
          </p>
        </div>

        {/* Delete button */}
        {onDelete && (
          <button
            onClick={handleDelete}
            className="ml-2 p-1 text-charcoal-400 hover:text-rust-500 opacity-0 group-hover:opacity-100 transition-all"
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
          className={`text-xs font-medium px-2 py-1 rounded-full ${getStatusColor(project.status)}`}
        >
          {getStatusLabel(project.status)}
        </span>
        <span className="text-xs text-charcoal-400">{formatDate(project.createdAt)}</span>
      </div>

      {/* URLs if deployed */}
      {project.vercelUrl && (
        <div className="mt-3 pt-3 border-t border-charcoal-700">
          <a
            href={project.vercelUrl}
            onClick={(e) => {
              e.stopPropagation();
              window.api.shell.openExternal(project.vercelUrl!);
            }}
            className="text-xs text-terracotta-500 hover:text-terracotta-400 flex items-center"
          >
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            {project.vercelUrl.replace('https://', '')}
          </a>
        </div>
      )}
    </div>
  );
}
