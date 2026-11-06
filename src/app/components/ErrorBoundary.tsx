import { Component, type ErrorInfo, type ReactNode } from "react";
import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resetSandbox, useStore } from "../store";

interface Props {
  children: ReactNode;
  /** "page" keeps the sidebar and header usable; "app" replaces the whole screen. */
  scope: "page" | "app";
  /** Changing it (the route) clears a caught error, so moving to another screen just works. */
  resetKey?: string;
}

/**
 * Catches a crash while drawing a screen and offers a way out instead of
 * a blank page. Nothing is lost: data is only ever changed by actions,
 * never by drawing.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Stock report: a screen failed to draw.", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <Fallback scope={this.props.scope} error={this.state.error} onRetry={() => this.setState({ error: null })} />;
  }
}

function Fallback({ scope, error, onRetry }: { scope: Props["scope"]; error: Error; onRetry: () => void }) {
  const store = useStore();
  const card = (
    <div role="alert" className="grid max-w-lg gap-4 rounded-xl border surface p-6">
      <div className="flex items-start gap-3">
        <TriangleAlertIcon className="mt-0.5 size-5 shrink-0 text-st-urgent" />
        <div className="min-w-0">
          <h2 className="font-semibold">{scope === "page" ? "This screen couldn't be shown" : "The stock report couldn't start"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your data is safe: nothing changes unless you act. Try again, or go back to Stock.
            {store.mode === "sandbox" && " If it keeps happening, starting over replaces this browser's private copy with fresh demo data."}
          </p>
          <p className="mt-2 truncate font-mono text-xs text-muted-foreground" title={error.message}>
            {error.message}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            if (scope === "app") window.location.reload();
            else onRetry();
          }}
        >
          <RotateCcwIcon /> Try again
        </Button>
        {scope === "page" && (
          <Button
            variant="outline"
            onClick={() => {
              window.location.hash = "stock";
              onRetry();
            }}
          >
            Go to Stock
          </Button>
        )}
        {store.mode === "sandbox" && (
          <Button
            variant="ghost"
            onClick={() => {
              resetSandbox("demo");
              window.location.hash = "stock";
              onRetry();
            }}
          >
            Start over with demo data
          </Button>
        )}
      </div>
    </div>
  );
  return scope === "page" ? card : <div className="grid min-h-dvh place-items-center px-4">{card}</div>;
}
