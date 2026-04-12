import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
  /** Label shown in fallback UI to identify which section crashed */
  label?: string;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

/**
 * Granular error boundary for wrapping individual sections (map, drawer, etc.).
 * Shows a compact inline fallback instead of crashing the entire app.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[SectionErrorBoundary${this.props.label ? ` - ${this.props.label}` : ""}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#080e1c",
            border: "1px solid #1e3050",
            borderRadius: 8,
            padding: 24,
            margin: 8,
            gap: 8,
            fontFamily: "'DM Sans', sans-serif",
            color: "#94a3b8",
            minHeight: 120,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
            {this.props.label || "Section"} failed to render
          </div>
          <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", lineHeight: 1.5 }}>
            An unexpected error occurred. Try reloading the page.
          </div>
          {this.state.errorMessage && (
            <div style={{ fontSize: 9, color: "#4a6080", fontFamily: "'JetBrains Mono', monospace", marginTop: 4, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {this.state.errorMessage}
            </div>
          )}
          <button
            onClick={() => this.setState({ hasError: false, errorMessage: null })}
            style={{
              marginTop: 4,
              background: "#1e3a5c",
              color: "#60a5fa",
              border: "1px solid #2563eb44",
              borderRadius: 6,
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
