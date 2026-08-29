import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/Button';

/**
 * Without this, a render error unmounts the whole tree and leaves a blank page
 * with nothing in the UI to explain it — which is exactly what a reload appears
 * to "fix", hiding the real fault.
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error:', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // Navigating away clears the error so one bad screen doesn't trap the app.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="surface grid place-items-center px-6 py-14 text-center">
        <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-rose-500/10 text-rose-500">
          <AlertTriangle size={22} />
        </span>
        <p className="text-sm font-medium text-fg">This screen ran into a problem</p>
        <p className="mx-auto mt-1 max-w-md break-words text-xs leading-relaxed text-fg-subtle">
          {this.state.error.message}
        </p>
        <Button variant="outline" className="mt-5" onClick={() => this.setState({ error: null })}>
          <RotateCcw size={14} /> Try again
        </Button>
      </div>
    );
  }
}
