import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Error boundary that wraps the main App content.
 * If D3 rendering crashes or data is malformed, shows a fallback UI
 * instead of a white screen — critical for demo reliability.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#060a12",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "'DM Sans', sans-serif",
            color: "#e2e8f0",
            gap: 16,
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: "#0b1525",
              border: "1px solid #1e3a5c",
              borderRadius: 10,
              padding: "16px 24px",
              textAlign: "center",
              maxWidth: 420,
              boxShadow: "0 12px 40px rgba(0,0,0,.6)",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>{"\u26A0\uFE0F"}</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
              Something went wrong
            </div>
            <div
              style={{
                fontSize: 13,
                color: "#64748b",
                lineHeight: 1.6,
                marginBottom: 8,
              }}
            >
              The map is temporarily unavailable. This may be caused by a
              rendering error or malformed data.
            </div>
            <div
              style={{
                fontSize: 11,
                color: "#2a3d5c",
                fontFamily: "'JetBrains Mono', monospace",
                marginBottom: 16,
              }}
            >
              245 sites {"\u00b7"} 69 countries {"\u00b7"} Try reloading to restore the view
            </div>
            <button
              onClick={() => window.location.reload()}
              onMouseOver={(e) => (e.currentTarget.style.background = "#264a6e")}
              onMouseOut={(e) => (e.currentTarget.style.background = "#1e3a5c")}
              style={{
                background: "#1e3a5c",
                color: "#60a5fa",
                border: "1px solid #2563eb44",
                borderRadius: 6,
                padding: "5px 10px",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                transition: "background 0.15s",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
