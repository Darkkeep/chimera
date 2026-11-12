import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./slide-preview.css";
import "./scene-editor.css";
import "./media-library.css";
import "./workspace.css";
import "./appearance.css";
import "./brand.css";
import "./production-kit/tokens.css";
import "./production-kit/components.css";
import "./production-brand.css";
import { initializeAppearance } from "./AppearanceSelector";
import { AuthGate } from "./AuthGate";

initializeAppearance();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthGate><App /></AuthGate>
  </StrictMode>,
);
