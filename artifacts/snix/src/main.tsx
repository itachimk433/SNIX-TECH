import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  document.body.innerHTML =
    '<div style="padding:32px;font-family:sans-serif;color:#ef4444;font-size:14px">Error: App root element not found. Please reinstall the app.</div>';
} else {
  createRoot(rootElement).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
