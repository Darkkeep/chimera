import type { Activity } from "./NativeExperience";

type Kind = Activity["kind"];
const id = () => crypto.randomUUID();
const choice = () => ({ id: id(), label: "New choice", feedback: "Explain the consequence." });
const step = () => {
  const choices = [choice(), choice()];
  return { id: id(), prompt: "Choose the best next action.", hint: "Consider the goal.", choices, correctChoiceId: choices[0].id };
};
export function newActivity(kind: Kind): Activity {
  const base = { id: id(), title: "New activity" };
  if (kind === "branching") {
    const nodeId = id();
    return { ...base, kind, startNodeId: nodeId, nodes: [{ id: nodeId, prompt: "What would you do?",
      choices: [{ label: "First action", feedback: "Explain the outcome.", nextNodeId: null },
        { label: "Second action", feedback: "Explain the alternative outcome.", nextNodeId: null }] }] };
  }
  if (kind === "hotspots") return { ...base, kind, diagramDescription: "Describe the relationship between these labelled points.",
    hotspots: [{ id: id(), label: "Point of interest", explanation: "Explain this point.", x: 50, y: 50 }] };
  if (kind === "sequencing") return { ...base, kind, instruction: "Put these steps in the correct order.",
    items: [{ id: id(), label: "First step" }, { id: id(), label: "Second step" }], feedback: "Explain why this order matters." };
  return { ...base, kind, steps: [step()] };
}

export function ExperienceActivityEditor({ activity, onChange }: { activity: Activity; onChange: (value: Activity) => void }) {
  function field(label: string, value: string, change: (value: string) => void, short = false) {
    return <label>{label}{short
      ? <input value={value} maxLength={120} onChange={event => change(event.target.value)} />
      : <textarea value={value} rows={2} maxLength={2000} onChange={event => change(event.target.value)} />}</label>;
  }
  return <div className="activity-editor">
    {field("Activity title", activity.title, title => onChange({ ...activity, title }), true)}
    {activity.kind === "branching" && <>
      <p>Every node must be reachable. Routes must end without cycles. A choice can end the route or continue to another node.</p>
      <label>Starting node<select value={activity.startNodeId} onChange={event => onChange({ ...activity, startNodeId: event.target.value })}>
        {activity.nodes.map((node, i) => <option key={node.id} value={node.id}>Node {i + 1}: {node.prompt}</option>)}
      </select></label>
      {activity.nodes.map((node, index) => {
        const update = (value: typeof node) => onChange({ ...activity, nodes: activity.nodes.map(n => n.id === node.id ? value : n) });
        return <fieldset key={node.id}><legend>Decision node {index + 1}</legend>
          {field("Decision prompt", node.prompt, prompt => update({ ...node, prompt }))}
          {node.choices.map((item, i) => {
            const change = (value: typeof item) => update({ ...node, choices: node.choices.map((c, j) => i === j ? value : c) });
            return <fieldset key={i}><legend>Decision choice {i + 1}</legend>
              {field("Choice label", item.label, label => change({ ...item, label }), true)}
              {field("Choice feedback", item.feedback, feedback => change({ ...item, feedback }))}
              <label>Continue to<select value={item.nextNodeId ?? ""} onChange={event => change({ ...item, nextNodeId: event.target.value || null })}>
                <option value="">End of route</option>
                {activity.nodes.filter(n => n.id !== node.id).map(n => <option key={n.id} value={n.id}>Node {activity.nodes.indexOf(n) + 1}: {n.prompt}</option>)}
              </select></label>
              <button type="button" disabled={node.choices.length <= 2} onClick={() => update({ ...node, choices: node.choices.filter((_, j) => i !== j) })}>Remove decision choice {i + 1}</button>
            </fieldset>;
          })}
          <button type="button" disabled={node.choices.length >= 6} onClick={() => update({ ...node, choices: [...node.choices, { label: "New action", feedback: "Explain the outcome.", nextNodeId: null }] })}>Add decision choice</button>
          <button type="button" disabled={activity.nodes.length <= 1} onClick={() => {
            const nodes = activity.nodes.filter(n => n.id !== node.id).map(n => ({ ...n, choices: n.choices.map(c => c.nextNodeId === node.id ? { ...c, nextNodeId: null } : c) }));
            onChange({ ...activity, nodes, startNodeId: activity.startNodeId === node.id ? nodes[0].id : activity.startNodeId });
          }}>Remove decision node {index + 1}</button>
        </fieldset>;
      })}
      <button type="button" disabled={activity.nodes.length >= 20} onClick={() => {
        const nextId = id();
        const nodes = activity.nodes.map((node, i) => i === activity.nodes.length - 1
          ? { ...node, choices: node.choices.map((c, j) => j === 0 ? { ...c, nextNodeId: nextId } : c) } : node);
        onChange({ ...activity, nodes: [...nodes, { id: nextId, prompt: "What happens next?", choices: [
          { label: "First action", feedback: "Explain the outcome.", nextNodeId: null },
          { label: "Second action", feedback: "Explain the outcome.", nextNodeId: null }] }] });
      }}>Add decision node</button>
    </>}
    {activity.kind === "hotspots" && <>
      {field("Diagram description", activity.diagramDescription, diagramDescription => onChange({ ...activity, diagramDescription }))}
      <p>Position numbered points on a schematic using percentages. The same explanations are available in a keyboard-accessible list; no image generation is needed.</p>
      {activity.hotspots.map((point, index) => {
        const update = (value: typeof point) => onChange({ ...activity, hotspots: activity.hotspots.map(p => p.id === point.id ? value : p) });
        return <fieldset key={point.id}><legend>Hotspot {index + 1}</legend>
          {field("Hotspot label", point.label, label => update({ ...point, label }), true)}
          {field("Hotspot explanation", point.explanation, explanation => update({ ...point, explanation }))}
          {(["x", "y"] as const).map(axis => <label key={axis}>{axis === "x" ? "Horizontal position (%)" : "Vertical position (%)"}
            <input type="number" min={5} max={95} value={point[axis]} onChange={event => update({ ...point, [axis]: Number(event.target.value) })} /></label>)}
          <button type="button" disabled={activity.hotspots.length <= 1} onClick={() => onChange({ ...activity, hotspots: activity.hotspots.filter(p => p.id !== point.id) })}>Remove hotspot {index + 1}</button>
        </fieldset>;
      })}
      <button type="button" disabled={activity.hotspots.length >= 12} onClick={() => onChange({ ...activity, hotspots: [...activity.hotspots,
        { id: id(), label: "New point", explanation: "Explain this point.", x: 50, y: 50 }] })}>Add hotspot</button>
    </>}
    {activity.kind === "sequencing" && <>
      {field("Sequence instruction", activity.instruction, instruction => onChange({ ...activity, instruction }))}
      <p>Author the correct order below. Learners start with the reverse order and use Move up/down controls, without dragging.</p>
      {activity.items.map((item, index) => <fieldset key={item.id}><legend>Correct position {index + 1}</legend>
        {field("Sequence item", item.label, label => onChange({ ...activity, items: activity.items.map(p => p.id === item.id ? { ...p, label } : p) }), true)}
        {[-1, 1].map(offset => <button type="button" key={offset} disabled={index + offset < 0 || index + offset >= activity.items.length} onClick={() => {
          const items = [...activity.items]; [items[index], items[index + offset]] = [items[index + offset], items[index]];
          onChange({ ...activity, items });
        }}>Move authored item {offset < 0 ? "up" : "down"}</button>)}
        <button type="button" disabled={activity.items.length <= 2} onClick={() => onChange({ ...activity, items: activity.items.filter(p => p.id !== item.id) })}>Remove sequence item {index + 1}</button>
      </fieldset>)}
      <button type="button" disabled={activity.items.length >= 10} onClick={() => onChange({ ...activity, items: [...activity.items, { id: id(), label: "New step" }] })}>Add sequence item</button>
      {field("Sequence feedback", activity.feedback, feedback => onChange({ ...activity, feedback }))}
    </>}
    {activity.kind === "guided-practice" && <>
      {activity.steps.map((item, index) => {
        const update = (value: typeof item) => onChange({ ...activity, steps: activity.steps.map(s => s.id === item.id ? value : s) });
        return <fieldset key={item.id}><legend>Practice step {index + 1}</legend>
          {field("Practice prompt", item.prompt, prompt => update({ ...item, prompt }))}
          {field("Practice hint", item.hint, hint => update({ ...item, hint }))}
          {item.choices.map((c, i) => {
            const change = (value: typeof c) => update({ ...item, choices: item.choices.map(p => p.id === c.id ? value : p) });
            return <fieldset key={c.id}><legend>Practice choice {i + 1}</legend>
              {field("Practice choice label", c.label, label => change({ ...c, label }), true)}
              {field("Practice choice feedback", c.feedback, feedback => change({ ...c, feedback }))}
              <button type="button" disabled={item.choices.length <= 2 || item.correctChoiceId === c.id}
                onClick={() => update({ ...item, choices: item.choices.filter(p => p.id !== c.id) })}>Remove practice choice {i + 1}</button>
            </fieldset>;
          })}
          <label>Correct practice choice<select value={item.correctChoiceId} onChange={event => update({ ...item, correctChoiceId: event.target.value })}>
            {item.choices.map((c, i) => <option key={c.id} value={c.id}>{i + 1}. {c.label}</option>)}
          </select></label>
          <button type="button" disabled={item.choices.length >= 6} onClick={() => update({ ...item, choices: [...item.choices, choice()] })}>Add practice choice</button>
          <button type="button" disabled={activity.steps.length <= 1} onClick={() => onChange({ ...activity, steps: activity.steps.filter(s => s.id !== item.id) })}>Remove practice step {index + 1}</button>
        </fieldset>;
      })}
      <button type="button" disabled={activity.steps.length >= 10} onClick={() => onChange({ ...activity, steps: [...activity.steps, step()] })}>Add practice step</button>
    </>}
  </div>;
}
