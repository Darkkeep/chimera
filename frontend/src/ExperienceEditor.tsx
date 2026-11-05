import type { Experience, ExperienceImageAsset } from "./NativeExperience";
import { ExperienceActivityEditor, newActivity } from "./ExperienceActivityEditor";

export function ExperienceEditor({ value, onChange, disabled = false, imageAssets = [] }: {
  value: Experience; onChange: (value: Experience) => void; disabled?: boolean; imageAssets?: ExperienceImageAsset[];
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
      <button type="button" onClick={() => onChange({ ...value, flow: value.flow.length === 2 ? [] : value.flow.filter((_, i) => i !== index) })}>Remove step {index + 1}</button>
    </fieldset>)}
    <button type="button" disabled={value.flow.length >= 5} onClick={() => onChange({ ...value, flow: [...value.flow, ...Array.from({ length: value.flow.length ? 1 : 2 }, () => ({ label: "", description: "" }))] })}>Add flow step</button>
    <h3>Click-reveal explanations</h3>
    {value.reveals.map((reveal, index) => <fieldset key={index}><legend>Reveal {index + 1}</legend>
      <label>Reveal label<input maxLength={120} value={reveal.label} onChange={event => onChange({ ...value, reveals: value.reveals.map((item, i) => i === index ? { ...item, label: event.target.value } : item) })} /></label>
      <label>Explanation<textarea maxLength={2000} value={reveal.explanation} onChange={event => onChange({ ...value, reveals: value.reveals.map((item, i) => i === index ? { ...item, explanation: event.target.value } : item) })} /></label>
      <button type="button" onClick={() => onChange({ ...value, reveals: value.reveals.filter((_, i) => i !== index) })}>Remove reveal {index + 1}</button>
    </fieldset>)}
    <button type="button" disabled={value.reveals.length >= 8} onClick={() => onChange({ ...value, reveals: [...value.reveals, { label: "", explanation: "" }] })}>Add reveal</button>
    <h3>Native activities</h3>
    <p>Formative practice with feedback, not graded assessments. At least one flow, reveal or activity is required.</p>
    {(value.activities ?? []).map((activity, index) => <fieldset key={activity.id}><legend>Activity {index + 1}: {activity.kind}</legend>
      <ExperienceActivityEditor activity={activity} imageAssets={imageAssets.filter(asset => asset.kind === "image").map(({ id, filename }) => ({ id, filename }))}
        onChange={changed => onChange({ ...value, activities: value.activities!.map(item => item.id === changed.id ? changed : item) })} />
      <button type="button" onClick={() => onChange({ ...value, activities: value.activities!.filter(item => item.id !== activity.id) })}>Remove activity {index + 1}</button>
    </fieldset>)}
    {(["branching", "hotspots", "sequencing", "guided-practice", "software-walkthrough", "before-after"] as const).map(kind => <button type="button" key={kind}
      disabled={(value.activities?.length ?? 0) >= 8} onClick={() => onChange({ ...value, activities: [
        ...value.activities ?? [],
        newActivity(kind, imageAssets.find(asset => asset.kind === "image")?.id ?? ""),
      ] })}>
      Add {({ branching: "branching decisions", hotspots: "hotspots", sequencing: "sequencing",
        "guided-practice": "guided practice", "software-walkthrough": "software walkthrough", "before-after": "before/after comparison" })[kind]}
    </button>)}
    {text("conclusion", "Conclusion", 2000)}
    <label className="experience-check"><input type="checkbox" checked={value.motion} onChange={event => onChange({ ...value, motion: event.target.checked })} />Offer optional diagram replay</label>
    <p>Text/background pairs must meet 4.5:1 contrast; diagram accents need 3:1 against the background. Learner content uses local system fonts.</p>
    {(["background", "foreground", "accent", "accentText", "diagramAccent"] as const).map(key => <label key={key}>{({ background: "Background color", foreground: "Text color", accent: "Control color", accentText: "Control text color", diagramAccent: "Diagram accent color" })[key]}<input value={value[key]} pattern="#[a-fA-F0-9]{6}" maxLength={7} onChange={event => onChange({ ...value, [key]: event.target.value })} /></label>)}
  </fieldset>;
}
