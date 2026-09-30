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
import { initializeAppearance } from "./AppearanceSelector";

initializeAppearance();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
