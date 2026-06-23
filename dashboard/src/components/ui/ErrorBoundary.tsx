import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// ErrorBoundary — contains render crashes so a single broken screen shows a
// graceful, recoverable panel instead of blanking the entire app to black.
// Resets its error state on the router's `key` change (route navigation) so the
// user can navigate away from a broken screen without a full reload.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface the crash for debugging; the panel shows the message to the user.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary] render crash:", error, info.componentStack);
  }

  private reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <section className="absolute inset-0 z-10 flex items-center justify-center px-[3vw] pb-5 pt-20">
        <div className="w-full max-w-[560px] rounded-2xl border border-[#f87171]/25 bg-white/[0.03] p-8 text-center backdrop-blur-xl">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#f87171]/15">
            <AlertTriangle className="h-6 w-6 text-[#f87171]" />
          </span>
          <h1 className="mt-4 text-[15px] font-semibold text-white/90">
            Something broke on this screen
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-white/55">
            The page hit an unexpected error and stopped rendering. Your data is safe — you
            can retry this screen or head back.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-left font-mono text-[11.5px] text-[#f8a3a3]">
            {error.message || String(error)}
          </pre>
          <div className="mt-5 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#5227FF] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors duration-200 hover:bg-[#5227FF]/90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5227FF]/60"
            >
              <RotateCcw className="h-4 w-4" />
              Retry
            </button>
            <a
              href="/"
              className="rounded-lg border border-white/15 px-3.5 py-2 text-[13px] font-medium text-white/70 transition-colors duration-200 hover:border-white/30 hover:text-white/90 cursor-pointer"
            >
              Back to Home
            </a>
          </div>
        </div>
      </section>
    );
  }
}
