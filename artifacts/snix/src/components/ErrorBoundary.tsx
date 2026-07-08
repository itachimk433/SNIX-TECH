import { Component, ErrorInfo, ReactNode } from "react";
import { Shield } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[SNIX] Unhandled error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "32px 24px",
          backgroundColor: "#f8fafc",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          textAlign: "center",
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            backgroundColor: "#ef4444",
            display: "flex", alignItems: "center", justifyContent: "center",
            marginBottom: 20,
          }}>
            <Shield size={32} color="white" />
          </div>
          <h2 style={{ color: "#0f172a", fontWeight: 800, fontSize: 18, margin: "0 0 8px" }}>
            SNIX encountered an error
          </h2>
          <p style={{ color: "#64748b", fontSize: 12, maxWidth: 280, lineHeight: 1.6, margin: "0 0 24px" }}>
            {this.state.error?.message || "An unexpected error occurred. Please restart the app."}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "12px 28px",
              backgroundColor: "#0f172a",
              color: "white",
              border: "none",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Restart App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
