import { useEffect, useRef, useState } from "react";
import { ChevronDown, RefreshCw, Sparkles } from "lucide-react";
import "./pythia-scene-actions.css";

type EngineStatus = {
  health: { status?: string };
  supportsStoryboardAnalyze: boolean;
  supportsStoryboardTransform: boolean;
  supportsAssessmentDesign: boolean;
};

type Props = {
  projectId: string;
  disabled: boolean;
  onAnalyze: () => void;
  onTransform: () => void;
  onDesignAssessment: () => void;
};

export function PythiaSceneActions({ projectId, disabled, onAnalyze, onTransform, onDesignAssessment }: Props) {
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const connected = engine?.health.status === "ok";
  const enabled = connected && !checking && !disabled;
  const tooltip = checking ? "Checking Pythia connection..." : error ? `${error} Check Settings > Intelligence Engine.` : "Pythia scene tools";

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    async function checkConnection() {
      setChecking(true);
      try {
        const response = await fetch(`/api/projects/${projectId}/pythia-status`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Pythia connection unavailable (${response.status}).`);
        const next: EngineStatus = await response.json();
        if (!controller.signal.aborted) {
          setEngine(next);
          setError(next.health.status === "ok" ? "" : "Pythia Engine is not healthy.");
        }
      } catch (issue) {
        if (!controller.signal.aborted) {
          setEngine(null);
          setError(issue instanceof Error ? issue.message : "Pythia connection unavailable.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setChecking(false);
          timer = window.setTimeout(checkConnection, 30000);
        }
      }
    }
    void checkConnection();
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [projectId, refreshKey]);

  useEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  function launch(action: () => void) {
    setOpen(false);
    action();
  }

  return <div className="pythia-scene-actions" ref={root} onKeyDown={event => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
      toggle.current?.focus();
    }
  }}>
    <div className="pythia-scene-controls">
      <span className="pythia-scene-toggle" title={tooltip}>
        <button ref={toggle} type="button" className="button button-outline" title={tooltip} aria-expanded={open && enabled} aria-controls="pythia-scene-tools" disabled={!enabled} onClick={() => setOpen(value => !value)}>
          <Sparkles size={16} /> Pythia <ChevronDown size={14} />
        </button>
      </span>
      {!connected && <button type="button" className="icon-button" aria-label="Check Pythia connection" title="Check Pythia connection" disabled={checking} onClick={() => setRefreshKey(value => value + 1)}><RefreshCw size={15} /></button>}
    </div>
    {open && enabled && <div id="pythia-scene-tools" className="pythia-scene-tools" role="group" aria-label="Pythia scene tools">
      <button type="button" className="button button-outline" disabled={!engine?.supportsStoryboardAnalyze} onClick={() => launch(onAnalyze)}>Analyze with Pythia</button>
      <button type="button" className="button button-outline" disabled={!engine?.supportsStoryboardTransform} onClick={() => launch(onTransform)}>Transform with Pythia</button>
      <button type="button" className="button button-outline" disabled={!engine?.supportsAssessmentDesign} onClick={() => launch(onDesignAssessment)}>Design assessment</button>
    </div>}
  </div>;
}
