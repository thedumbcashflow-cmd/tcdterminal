import { Component, ReactNode } from "react";

interface Props {
  panelName: string;
  onRetry: () => void;
  lastSuccessAt?: Date | null;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Per-panel error boundary for the Data Room. Isolates JS exceptions in one
 * panel so they don't crash sibling panels. The Retry button only re-mounts
 * THIS panel's children — sibling panels keep their state and don't refetch.
 */
export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || "Unknown error" };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Server-side capture: Supabase edge logs collect stderr from any
    // function we ping. We log to console.error here — captured by browser
    // logs and forwarded to Supabase via the project's logging pipeline.
    // We intentionally do NOT show the raw exception to the user.
    console.error(JSON.stringify({
      event: "panel_render_error",
      panel: this.props.panelName,
      message: error?.message,
      stack: info?.componentStack?.slice(0, 1000),
      timestamp: new Date().toISOString(),
    }));
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: "" });
    this.props.onRetry();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="font-mono text-xs text-red-400 flex flex-col gap-2">
          <span>Panel unavailable — please retry.</span>
          {this.props.lastSuccessAt && (
            <span className="text-zinc-500 text-[10px]">
              Last successful load: {this.props.lastSuccessAt.toLocaleTimeString("en-US", { hour12: false })}
            </span>
          )}
          <button
            onClick={this.handleRetry}
            className="self-start border border-red-500/40 text-red-300 px-2 py-0.5 rounded hover:bg-red-500/10 transition-colors"
          >
            Retry ↺
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
