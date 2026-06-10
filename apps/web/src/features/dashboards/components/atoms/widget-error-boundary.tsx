import { Component } from "react";
import type { ReactNode } from "react";

interface WidgetErrorBoundaryProps {
  children: ReactNode;
}

interface WidgetErrorBoundaryState {
  hasError: boolean;
}

// Error boundaries still require a class component; keep this the only one.
// Scoped per widget so one failing query never blanks the whole dashboard.
export class WidgetErrorBoundary extends Component<
  WidgetErrorBoundaryProps,
  WidgetErrorBoundaryState
> {
  state: WidgetErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): WidgetErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-24 items-center justify-center rounded-lg border border-border p-4 text-destructive text-sm">
          Failed to load widget.
        </div>
      );
    }
    return this.props.children;
  }
}
