import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-charcoal-800 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-charcoal-700 rounded-lg shadow-lg border border-charcoal-600 p-6 text-center">
            <div className="w-16 h-16 bg-rust-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-rust-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-cream-100 mb-2">Something went wrong</h2>
            <p className="text-charcoal-200 mb-4">
              An unexpected error occurred. You can try to recover or reload the app.
            </p>
            {this.state.error && import.meta.env.DEV && (
              <details className="mb-4 text-left">
                <summary className="text-sm text-charcoal-300 cursor-pointer hover:text-cream-100">
                  Error details (dev only)
                </summary>
                <pre className="mt-2 p-3 bg-charcoal-950 rounded text-xs text-rust-400 overflow-auto max-h-32">
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <div className="flex space-x-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 text-charcoal-300 hover:text-cream-100 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-terracotta-500 text-charcoal-950 rounded-lg hover:bg-terracotta-600 transition-colors"
              >
                Reload App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
