import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import mcAvatar from '../../assets/mc-avatar.webp';

const INSPIRATION_EXAMPLES = [
  'A habit tracker with streaks and reminders',
  'A simple blog with markdown support',
  'A recipe manager with ingredient search',
  'A workout log with progress charts',
];

export default function StageLaunch() {
  const { createProject, goToDiscovery, setCurrentProject, updateProject } = useAppStore();
  const [idea, setIdea] = useState('');
  const [projectName, setProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateName = (text: string) => {
    const words = text.trim().split(/\s+/).slice(0, 3);
    return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
  };

  const handleIdeaChange = (value: string) => {
    setIdea(value);
    if (value.trim()) {
      setProjectName(generateName(value));
    } else {
      setProjectName('');
    }
  };

  const handleExampleClick = (example: string) => {
    setIdea(example);
    setProjectName(generateName(example));
  };

  const handleSubmit = async () => {
    if (!idea.trim() || !projectName.trim()) return;

    setIsCreating(true);
    setError(null);
    try {
      const project = await createProject(projectName.trim(), idea.trim());
      if (!project) {
        throw new Error('Failed to create project - no project returned');
      }
      setCurrentProject(project);
      await updateProject({ status: 'discovery' });
      goToDiscovery();
    } catch (err) {
      console.error('Failed to create project:', err);
      setError(err instanceof Error ? err.message : 'Failed to create project. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="max-w-xl w-full">
      {/* Assistant avatar with celebration glow */}
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-accent mb-4 shadow-glow-green animate-mc-pulse">
          <img src={mcAvatar} alt="Assistant" className="w-full h-full object-cover scale-[1.3] translate-y-[15%]" />
        </div>
        <div className="card-panel p-4 max-w-md text-center">
          <p className="text-sm text-ink leading-relaxed">
            You're all set! What do you want to build?
          </p>
        </div>
      </div>

      {/* Idea textarea */}
      <div className="mb-4">
        <label htmlFor="launch-idea" className="block text-sm font-sans font-medium text-ink mb-2">
          Your Idea
        </label>
        <textarea
          id="launch-idea"
          value={idea}
          onChange={(e) => handleIdeaChange(e.target.value)}
          placeholder="I want to build a todo app that helps teams track their daily tasks with real-time collaboration..."
          rows={4}
          className="input-inset w-full px-4 py-3 border border-border focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none bg-surface text-ink placeholder:text-ink-muted"
          autoFocus
        />
      </div>

      {/* Project name */}
      {idea.trim() && (
        <div className="mb-4">
          <label htmlFor="launch-name" className="block text-sm font-sans font-medium text-ink mb-2">
            Project Name
          </label>
          <input
            id="launch-name"
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="MyAwesomeApp"
            className="input-inset w-full px-4 py-3 border border-border focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent bg-surface text-ink placeholder:text-ink-muted"
          />
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="mb-4 bg-error/10 border border-error/30 p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-error mt-0.5 mr-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <h3 className="font-medium text-error">Error Creating Project</h3>
              <p className="text-sm text-error mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={!idea.trim() || !projectName.trim() || isCreating}
        className="btn-solid-primary w-full py-3 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed mb-6"
      >
        {isCreating ? (
          <>
            <div className="w-5 h-5 border-4 border-white border-t-transparent animate-spin" />
            <span>Creating project...</span>
          </>
        ) : (
          <>
            <span>BUILD IT</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </>
        )}
      </button>

      {/* Inspiration examples */}
      <div className="border-t border-border pt-4">
        <p className="text-sm font-sans font-medium text-ink mb-3">Need inspiration?</p>
        <div className="flex flex-wrap gap-2">
          {INSPIRATION_EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => handleExampleClick(example)}
              className="text-left px-3 py-2 text-sm text-ink-secondary bg-surface hover:bg-surface-card transition-colors border border-border"
            >
              {example}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
