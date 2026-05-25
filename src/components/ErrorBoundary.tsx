import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary capturou:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            background: "#f8f9fa",
            padding: 32,
            fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
            color: "#1f2937",
          }}
        >
          <div
            style={{
              maxWidth: 720,
              margin: "40px auto",
              background: "#fff",
              border: "1px solid #fecaca",
              borderRadius: 16,
              padding: 24,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#dc2626" }}>
              ⚠️ Ocorreu um erro ao renderizar a tela
            </h2>
            <p style={{ marginTop: 12, fontSize: 14, color: "#6b7280" }}>
              {this.state.error.message}
            </p>
            <pre
              style={{
                marginTop: 12,
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: 12,
                fontSize: 12,
                color: "#374151",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 320,
                overflow: "auto",
              }}
            >
              {this.state.error.stack}
            </pre>
            <button
              onClick={this.reset}
              style={{
                marginTop: 16,
                padding: "10px 20px",
                borderRadius: 10,
                border: "none",
                background: "#0071e3",
                color: "#fff",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
