import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureError } from '@/lib/monitoring';
import { logClientEvent } from '@/lib/client-log';
import { isChunkLoadError, recoverFromStaleBuild } from '@/lib/lazy-with-retry';

interface Props {
  children: ReactNode;
  /** Changing this value resets the boundary (used to reset on navigation). */
  resetKey?: string;
}

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Per-route error boundary.
 *
 * A crash inside one screen no longer blanks the whole app: the shell and the
 * session stay alive and the user gets a retry. Stale-build failures are
 * recovered automatically instead of being shown as an error.
 */
export default class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: undefined });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error)) {
      void recoverFromStaleBuild(error.message);
      return;
    }
    captureError(error, { componentStack: info.componentStack });
    logClientEvent({ kind: 'render_crash', message: `${error.name}: ${error.message}` });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md space-y-4 rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">No pudimos mostrar esta pantalla</h1>
          <p className="text-sm text-muted-foreground">
            El resto de la aplicación sigue funcionando. Puedes reintentar o volver al inicio.
          </p>
          <div className="flex justify-center gap-2">
            <button
              onClick={() => this.setState({ hasError: false, message: undefined })}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Reintentar
            </button>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Recargar
            </button>
          </div>
        </div>
      </div>
    );
  }
}
