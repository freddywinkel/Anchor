import { createRoot } from "react-dom/client";
import { App } from "./App";
import { Component, type ReactNode } from "react";
import "./app.css";
import "./themes.css";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main
        style={{
          padding: 24,
          minHeight: "100dvh",
          boxSizing: "border-box",
          fontFamily: "system-ui",
          color: "#f4efe6",
          background: "#171614",
        }}
      >
        <h1>Anchor kon dit scherm niet openen.</h1>
        <p>
          Je opgeslagen gegevens zijn niet gewist. Herlaad om opnieuw te
          proberen.
        </p>
        <button onClick={() => location.reload()}>Opnieuw openen</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("anchor-root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
