import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '../../components/ui';

interface State {
  failed: boolean;
}

/**
 * Keeps a page that crashes (or whose code failed to download, e.g. after a new
 * deployment) from taking the whole app down. Remounted on navigation, so moving to
 * another page recovers.
 */
export class RouteErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('page failed to render', error, info.componentStack);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <ErrorState
        title="This page didn't load"
        message="Reloading usually fixes it. If it keeps happening, the app may have just been updated."
        onRetry={() => window.location.reload()}
      />
    );
  }
}
