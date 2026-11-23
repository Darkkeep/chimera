import { useEffect, useState } from "react";
import type { ElementAnimations } from "./SceneSurface";

export function defaultAnimations(): ElementAnimations {
  return {
    entrance: { effect: "none", durationMs: 600, delayMs: 0 },
    presentation: { effect: "none", durationMs: 800, delayMs: 0, iterations: 1 },
    exit: { effect: "none", durationMs: 400, delayMs: 3000 },
  };
}

export function alignExitTiming(value: ElementAnimations): ElementAnimations {
  const entranceEnd = value.entrance.effect === "none" ? 0 : value.entrance.delayMs + value.entrance.durationMs;
  const presentationEnd = value.presentation.effect === "none" ? entranceEnd : entranceEnd + value.presentation.delayMs + value.presentation.durationMs * (value.presentation.iterations || 1);
  return { ...value, exit: { ...value.exit, delayMs: value.exit.effect === "none" ? value.exit.delayMs : Math.max(value.exit.delayMs, presentationEnd) } };
}

export function AnimationControls({ animations, onChange, disabled, gallery = false, focusPhase = "entrance" }: { animations?: ElementAnimations | null; onChange: (value: ElementAnimations | null) => void; disabled: boolean; gallery?: boolean; focusPhase?: "entrance" | "presentation" | "exit" }) {
  const [error, setError] = useState("");
  const [activePhase, setActivePhase] = useState<"entrance" | "presentation" | "exit">("entrance");
  useEffect(()=>setActivePhase(focusPhase),[focusPhase]);
  const value = animations || defaultAnimations();
  const effects = {
    entrance: [["none", "None"], ["fade", "Fade"], ["slide-up", "Slide up"], ["slide-left", "Slide from left"], ["zoom", "Zoom"], ["bounce", "Bounce into place"]],
    presentation: [["none", "None"], ["pulse", "Pulse"], ["sway", "Sway"], ["highlight", "Highlight"]],
    exit: [["none", "None"], ["fade", "Fade out"], ["slide-up", "Slide down"], ["slide-left", "Slide to left"], ["zoom", "Shrink out"]],
  };
  function change(phase: keyof ElementAnimations, changes: Partial<ElementAnimations["entrance"]>) {
    const next = alignExitTiming({ ...value, [phase]: { ...value[phase], ...changes } });
    if (next.exit.delayMs > 3600000) { setError("The exit must start within one hour. Shorten the earlier effects first."); return; }
    setError("");
    onChange(next);
  }
  return <section aria-label="Element animations">
    <fieldset disabled={disabled}>
      {gallery && <><div className="inspector-tabs" role="group" aria-label="Animation phase">{(["entrance","presentation","exit"] as const).map(phase => <button type="button" key={phase} aria-pressed={activePhase === phase} onClick={() => setActivePhase(phase)}>{phase === "presentation" ? "Emphasis" : phase[0].toUpperCase()+phase.slice(1)}</button>)}</div><div className="effect-gallery" role="group" aria-label={`${activePhase} effects`}>{effects[activePhase].map(([effect,label]) => <button type="button" key={effect} aria-pressed={value[activePhase].effect===effect} onClick={() => change(activePhase,{effect})}>{label}</button>)}</div></>}

      {(["entrance", "presentation", "exit"] as const).map(phase => <div key={phase} hidden={gallery && activePhase !== phase}>
        <label>{phase === "entrance" ? "Entrance" : phase === "presentation" ? "Emphasis" : "Exit"}<select aria-label={`${phase} effect`} value={value[phase].effect} onChange={event => change(phase, { effect: event.target.value })}>{effects[phase].map(([effect, label]) => <option key={effect} value={effect}>{label}</option>)}</select></label>
        {value[phase].effect !== "none" && <div className="visual-numbers">
          <label>Duration (ms)<input aria-label={`${phase} duration (ms)`} type="number" min={100} max={60000} step={50} value={value[phase].durationMs} onChange={event => { const durationMs = event.target.valueAsNumber; if (Number.isInteger(durationMs) && durationMs >= 100 && durationMs <= 60000) change(phase, { durationMs }); }} /></label>
          <label>{phase === "exit" ? "Scene time (ms)" : "Delay (ms)"}<input aria-label={`${phase} delay (ms)`} type="number" min={0} max={3600000} step={50} value={value[phase].delayMs} onChange={event => { const delayMs = event.target.valueAsNumber; if (Number.isInteger(delayMs) && delayMs >= 0 && delayMs <= 3600000) change(phase, { delayMs }); }} /></label>
          {phase === "presentation" && <label>Repeats<input aria-label="Presentation repeats" type="number" min={1} max={5} value={value.presentation.iterations || 1} onChange={event => { const iterations = event.target.valueAsNumber; if (Number.isInteger(iterations) && iterations >= 1 && iterations <= 5) { setError(""); const next = alignExitTiming({ ...value, presentation: { ...value.presentation, iterations } }); if (next.exit.delayMs <= 3600000) onChange(next); else setError("Shorten the presentation before adding repeats."); } }} /></label>}
        </div>}
      </div>)}
    </fieldset>
    {error && <p role="alert">{error}</p>}
  </section>;
}