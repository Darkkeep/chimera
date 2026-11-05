import type { Experience } from "./NativeExperience";

export function ExperienceEditor({ value, onChange, disabled = false }: {
  value: Experience; onChange: (value: Experience) => void; disabled?: boolean;
}) {
  function text(key: "heading" | "introduction" | "conclusion", label: string, limit: number) {
    return <label>{label}<textarea value={value[key]} maxLength={limit} rows={key === "heading" ? 1 : 3}
      onChange={event => onChange({ ...value, [key]: event.target.value })} /></label>;
  }
  return <fieldset disabled={disabled} className="experience-editor"><legend>Learner experience</legend>
    {text("heading", "Experience heading", 120)}
    {text("introduction", "Introduction", 2000)}
    <h3>Concept flow</h3>
    {value.flow.map((step, index) => <fieldset key={index}><legend>Flow step {index + 1}</legend>
      <label>Step label<input maxLength={120} value={step.label} onChange={event => onChange({ ...value, flow: value.flow.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></label>
      <label>Step explanation<textarea maxLength={2000} value={step.description} onChange={event => onChange({ ...value, flow: value.flow.map((item, i) => i === index ? { ...item, description: event.target.value } : item) })} /></label>
      <button type="button" disabled={value.flow.length <= 2} onClick={() => onChange({ ...value, flow: value.flow.filter((_, i) => i !== index) })}>Remove step {index + 1}</button>
    </fieldset>)}
    <button type="button" disabled={value.flow.length >= 5} onClick={() => onChange({ ...value, flow: [...value.flow, { label: "", description: "" }] })}>Add flow step</button>
    <h3>Click-reveal explanations</h3>
    {value.reveals.map((reveal, index) => <fieldset key={index}><legend>Reveal {index + 1}</legend>
      <label>Reveal label<input maxLength={120} value={reveal.label} onChange={event => onChange({ ...value, reveals: value.reveals.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></label>
      <label>Explanation<textarea maxLength={2000} value={reveal.explanation} onChange={event => onChange({ ...value, reveals: value.reveals.map((item, i) => i === index ? { ...item, explanation: event.target.value } : item) })} /></label>
      <button type="button" disabled={value.reveals.length <= 1} onClick={() => onChange({ ...value, reveals: value.reveals.filter((_, i) => i !== index) })}>Remove reveal {index + 1}</button>
    </fieldset>)}
    <button type="button" disabled={value.reveals.length >= 8} onClick={() => onChange({ ...value, reveals: [...value.reveals, { label: "", explanation: "" }] })}>Add reveal</button>
    {text("conclusion", "Conclusion", 2000)}
    <label className="experience-check"><input type="checkbox" checked={value.motion} onChange={event => onChange({ ...value, motion: event.target.checked })} />Offer optional diagram replay</label>
    <p>Text/background pairs must meet 4.5:1 contrast; diagram accents need 3:1 against the background. Learner content uses local system fonts.</p>
    {(["background", "foreground", "accent", "accentText", "diagramAccent"] as const).map(key => <label key={key}>{({ background: "Background color", foreground: "Text color", accent: "Control color", accentText: "Control text color", diagramAccent: "Diagram accent color" })[key]}<input value={value[key]} pattern="#[a-fA-F0-9]{6}" maxLength={7} onChange={event => onChange({ ...value, [key]: event.target.value })} /></label>)}
  </fieldset>;
}
