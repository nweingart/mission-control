import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';

export default function IdeaScreen() {
  const { createProject, goToHome, goToDiscovery, setCurrentProject, updateProject } = useAppStore();
  const [idea, setIdea] = useState('');
  const [projectName, setProjectName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idea.trim() || !projectName.trim()) return;

    setIsCreating(true);
    setError(null);
    try {
      const project = await createProject(projectName.trim(), idea.trim());
      if (!project) {
        throw new Error('Failed to create project - no project returned');
      }
      setCurrentProject(project);
      // Update status to 'discovery' so project resumes correctly on reload
      await updateProject({ status: 'discovery' });
      goToDiscovery();
    } catch (err) {
      console.error('Failed to create project:', err);
      setError(err instanceof Error ? err.message : 'Failed to create project. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const generateProjectName = () => {
    // Generate a simple project name from the idea
    const words = idea.trim().split(/\s+/).slice(0, 3);
    if (words.length > 0) {
      const name = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
      setProjectName(name);
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-surface-card border-b border-border px-6 py-4 drag-region header-with-traffic-lights">
        <div className="flex items-center space-x-4">
          <button
            onClick={goToHome}
            className="text-ink-muted hover:text-ink transition-colors no-drag"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-sans font-bold text-ink">What do you want to build?</h1>
            <p className="text-ink-muted text-sm">Describe your idea in as much detail as you'd like</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6 flex items-center justify-center">
        <form onSubmit={handleSubmit} className="w-full max-w-2xl space-y-6">
          {/* Idea textarea */}
          <div>
            <label htmlFor="idea" className="block text-sm font-sans font-medium text-ink mb-2">
              Your Idea
            </label>
            <textarea
              id="idea"
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="I want to build a todo app that helps teams track their daily tasks with real-time collaboration..."
              rows={6}
              className="input-inset w-full px-4 py-3 border border-border focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none bg-surface text-ink placeholder:text-ink-muted"
              autoFocus
            />
            <p className="text-sm text-ink-muted mt-1">
              Be as detailed as you want - Claude will ask clarifying questions
            </p>
          </div>

          {/* Project name */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="name" className="block text-sm font-sans font-medium text-ink">
                Project Name
              </label>
              {idea.trim() && !projectName && (
                <button
                  type="button"
                  onClick={generateProjectName}
                  className="text-sm text-accent hover:text-accent-hover"
                >
                  Generate from idea
                </button>
              )}
            </div>
            <input
              id="name"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="MyAwesomeApp"
              className="input-inset w-full px-4 py-3 border border-border focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent bg-surface text-ink placeholder:text-ink-muted"
            />
          </div>

          {/* Error display */}
          {error && (
            <div className="bg-error/10 border border-error/30 p-4">
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
            type="submit"
            disabled={!idea.trim() || !projectName.trim() || isCreating}
            className="btn-solid-primary w-full py-3 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? (
              <>
                <div className="w-5 h-5 border-4 border-white border-t-transparent animate-spin" />
                <span>Creating project...</span>
              </>
            ) : (
              <>
                <span>Let's go!</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                  />
                </svg>
              </>
            )}
          </button>

          {/* Examples */}
          <div className="pt-6 border-t border-border">
            <p className="text-sm font-sans font-medium text-ink mb-3">Need inspiration? Try one of these:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[
                'A habit tracker with streaks and reminders',
                'A simple blog with markdown support',
                'A recipe manager with ingredient search',
                'A workout log with progress charts',
              ].map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => {
                    setIdea(example);
                    const name = example.split(' ').slice(1, 3).map(w =>
                      w.charAt(0).toUpperCase() + w.slice(1)
                    ).join('');
                    setProjectName(name);
                  }}
                  className="text-left px-3 py-2 text-sm text-ink-secondary bg-surface hover:bg-surface-card transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
