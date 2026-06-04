import { Component } from "react";
import type { ReactNode } from "react";

interface CardErrorBoundaryProps {
  children: ReactNode;
}

interface CardErrorBoundaryState {
  hasError: boolean;
}

// Error boundaries still require a class component; keep this the only one.
// Scoped per card so one failing query never blanks the whole dashboard.
export class CardErrorBoundary extends Component<
  CardErrorBoundaryProps,
  CardErrorBoundaryState
> {
  state: CardErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): CardErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-24 items-center justify-center rounded-lg border border-border p-4 text-destructive text-sm">
          Failed to load card.
        </div>
      );
    }
    return this.props.children;
  }
}
