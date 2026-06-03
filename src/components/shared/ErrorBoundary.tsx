import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Page-scoped error boundary. A crashing page falls back to the message +
 * Reload button below; the surrounding Layout (sidebar, top bar, modals)
 * stays alive so the user isn't stranded.
 *
 * Class component because React's error-boundary API is still class-only.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the failure in dev / console so the developer sees it; nothing
    // is sent to a remote service in this MVP.
    console.error('[page error]', error, info.componentStack)
  }

  handleReload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex min-h-[60vh] flex-col items-center justify-center text-center"
        >
          <AlertTriangle
            className="h-12 w-12 text-[var(--priority-critical)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <h2 className="mt-4 text-base font-medium text-[var(--text-primary)]">
            Something went wrong on this page.
          </h2>
          <p className="mt-1 max-w-md text-sm text-[var(--text-secondary)]">
            The rest of the app is still working — reload to get this page
            back.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-4 text-sm font-medium text-[var(--text-inverse)] transition-colors hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-focus)]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
