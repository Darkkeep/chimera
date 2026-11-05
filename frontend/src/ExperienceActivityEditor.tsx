import type { Activity } from "./NativeExperience";

type Kind = Activity["kind"];
const id = () => crypto.randomUUID();
const choice = () => ({ id: id(), label: "New choice", feedback: "Explain the consequence." });
const step = () => {
  const choices = [choice(), choice()];
  return { id: id(), prompt: "Choose the best next action.", hint: "Consider the goal.", choices, correctChoiceId: choices[0].id };
};
export function newActivity(kind: Kind, screenshotAssetId = ""): Activity {
  const base = { id: id(), title: "New activity" };
  if (kind === "branching") {
    const nodeId = id();
    return { ...base, kind, startNodeId: nodeId, nodes: [{ id: nodeId, prompt: "What would you do?",
      choices: [{ label: "First action", feedback: "Explain the outcome.", nextNodeId: null },
        { label: "Second action", feedback: "Explain the alternative outcome.", nextNodeId: null }] }] };
  }
  if (kind === "hotspots") return { ...base, kind, diagramDescription: "Describe the image or relationship between these labelled points.", imageAssetId: null,
    hotspots: [{ id: id(), label: "Point of interest", explanation: "Explain this point.", x: 50, y: 50 }] };
  if (kind === "sequencing") return { ...base, kind, instruction: "Put these steps in the correct order.",
    items: [{ id: id(), label: "First step" }, { id: id(), label: "Second step" }], feedback: "Explain why this order matters." };
  if (kind === "guided-practice") return { ...base, kind, steps: [step()] };
  if (kind === "before-after") return { ...base, kind, instruction: "Inspect both images and identify what changed.",
    before: { imageAssetId: screenshotAssetId, label: "Before", altText: "Describe the original image.", description: "Explain the original state." },
    after: { imageAssetId: "", label: "After", altText: "Describe the changed image.", description: "Explain the changed state." },
    explanation: "Explain the key change and why it matters." };
  return { ...base, kind, steps: [{ id: id(), label: "Open the settings",
    screenshotAssetId, screenshotAltText: "Describe the visible controls and relevant state.",
    description: "Explain what the screenshot shows.", actionPrompt: "Describe the action to complete." }] };
}

export function ExperienceActivityEditor({ activity, onChange, imageAssets = [] }: {
  activity: Activity; onChange: (value: Activity) => void; imageAssets?: { id: string; filename: string }[];
}) {
  function field(label: string, value: string, change: (value: string) => void, short = false) {
    return <label>{label}{short
      ? <input value={value} maxLength={120} onChange={event => change(event.target.value)} />
      : <textarea value={value} rows={2} maxLength={2000} onChange={event => change(event.target.value)} />}</label>;
  }
  return <div className="activity-editor">
    {field("Activity title", activity.title, title => onChange({ ...activity, title }), true)}
    {activity.kind === "before-after" && <>
      <p>Select two distinct project images. Learners inspect each full image and can mark the comparison reviewed; this is formative.</p>
      {field("Comparison instruction", activity.instruction, instruction => onChange({ ...activity, instruction }))}
      {(["before", "after"] as const).map(side => <fieldset key={side}><legend>{side === "before" ? "Before image" : "After image"}</legend>
        <label>{side === "before" ? "Before" : "After"} project image<select value={activity[side].imageAssetId}
          onChange={event => onChange({ ...activity, [side]: { ...activity[side], imageAssetId: event.target.value } })}>
          <option value="">Select a project image</option>
          {activity[side].imageAssetId && !imageAssets.some(asset => asset.id === activity[side].imageAssetId)
            && <option value={activity[side].imageAssetId}>Unavailable image ({activity[side].imageAssetId})</option>}
          {imageAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}
        </select></label>
        {field(`${side} label`, activity[side].label, label => onChange({ ...activity, [side]: { ...activity[side], label } }), true)}
        <label>{side} alternative text<textarea maxLength={500} value={activity[side].altText}
          onChange={event => onChange({ ...activity, [side]: { ...activity[side], altText: event.target.value } })} /></label>
        {field(`${side} description`, activity[side].description, description => onChange({ ...activity, [side]: { ...activity[side], description } }))}
      </fieldset>)}
      {field("Change explanation", activity.explanation, explanation => onChange({ ...activity, explanation }))}
    </>}
    {activity.kind === "branching" && <>
      <p>Every node must be reachable through visible choices. Routes must end without cycles. A choice can end the route or continue to another node.</p>
      <fieldset><legend>Activity variables</legend>
        <p>Optional Boolean variables start at their initial values and reset when the scenario restarts. A selected choice applies its assignments after its visibility condition is checked.</p>
        {(activity.variables ?? []).map((variable, index) => <fieldset key={variable.id}>
          <legend>Variable {index + 1}</legend>
          {field("Variable label", variable.label, label => onChange({ ...activity,
            variables: activity.variables?.map(item => item.id === variable.id ? { ...item, label } : item) ?? [] }), true)}
          <label><input type="checkbox" checked={variable.initialValue} onChange={event => onChange({ ...activity,
            variables: activity.variables?.map(item => item.id === variable.id ? { ...item, initialValue: event.target.checked } : item) ?? [] })} />
            Initially true</label>
          <button type="button" onClick={() => onChange({ ...activity,
            variables: activity.variables?.filter(item => item.id !== variable.id) ?? [],
            nodes: activity.nodes.map(node => ({ ...node, choices: node.choices.map(item => ({
              ...item,
              visibleWhen: item.visibleWhen?.variableId === variable.id ? null : item.visibleWhen,
              setVariables: item.setVariables?.filter(assignment => assignment.variableId !== variable.id) ?? [],
            })) })),
          })}>Remove variable {index + 1}</button>
        </fieldset>)}
        <button type="button" disabled={(activity.variables?.length ?? 0) >= 5} onClick={() => onChange({ ...activity,
          variables: [...(activity.variables ?? []), { id: id(), label: "New variable", initialValue: false }],
        })}>Add variable</button>
      </fieldset>
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
              <label>Show choice when<select value={item.visibleWhen ? `${item.visibleWhen.variableId}:${item.visibleWhen.equals}` : ""}
                onChange={event => {
                  const [variableId, equals] = event.target.value.split(":");
                  change({ ...item, visibleWhen: variableId ? { variableId, equals: equals === "true" } : null });
                }}>
                <option value="">Always visible</option>
                {(activity.variables ?? []).flatMap(variable => [true, false].map(value =>
                  <option key={`${variable.id}:${value}`} value={`${variable.id}:${value}`}>{variable.label} is {value ? "true" : "false"}</option>))}
              </select></label>
              {(item.setVariables ?? []).map((assignment, assignmentIndex) => <fieldset key={assignment.variableId}>
                <legend>Set variable {assignmentIndex + 1}</legend>
                <label>Variable<select value={assignment.variableId} onChange={event => change({ ...item,
                  setVariables: item.setVariables?.map((value, index) => index === assignmentIndex
                    ? { ...value, variableId: event.target.value } : value) ?? [],
                })}>
                  {(activity.variables ?? []).filter(variable => variable.id === assignment.variableId
                    || !(item.setVariables ?? []).some((value, index) => index !== assignmentIndex && value.variableId === variable.id))
                    .map(variable => <option key={variable.id} value={variable.id}>{variable.label}</option>)}
                </select></label>
                <label>Set to<select value={String(assignment.value)} onChange={event => change({ ...item,
                  setVariables: item.setVariables?.map((value, index) => index === assignmentIndex
                    ? { ...value, value: event.target.value === "true" } : value) ?? [],
                })}>
                  <option value="true">True</option><option value="false">False</option>
                </select></label>
                <button type="button" onClick={() => change({ ...item,
                  setVariables: item.setVariables?.filter((_, index) => index !== assignmentIndex) ?? [],
                })}>Remove variable assignment {assignmentIndex + 1}</button>
              </fieldset>)}
              <button type="button" disabled={(activity.variables?.length ?? 0) === 0
                || (item.setVariables?.length ?? 0) >= (activity.variables?.length ?? 0)}
                onClick={() => {
                  const assigned = new Set((item.setVariables ?? []).map(value => value.variableId));
                  const next = (activity.variables ?? []).find(variable => !assigned.has(variable.id));
                  if (next) change({ ...item, setVariables: [...(item.setVariables ?? []), { variableId: next.id, value: true }] });
                }}>Add variable assignment</button>
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
      <label>Background image (optional)<select value={activity.imageAssetId ?? ""} onChange={event => onChange({ ...activity, imageAssetId: event.target.value || null })}>
        <option value="">Use the labelled schematic</option>
        {activity.imageAssetId && !imageAssets.some(asset => asset.id === activity.imageAssetId)
          && <option value={activity.imageAssetId}>Unavailable image ({activity.imageAssetId})</option>}
        {imageAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}
      </select></label>
      <p>Position numbered points at percentages of the image canvas. The separate hotspot list stays in the order authored below and remains available to keyboard and screen-reader users.</p>
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
    {activity.kind === "software-walkthrough" && <>
      <p>Use screenshots from this project to guide a real task. Chimera does not open or control the software; learners confirm each action themselves.</p>
      {activity.steps.map((item, index) => {
        const update = (value: typeof item) => onChange({ ...activity, steps: activity.steps.map(current => current.id === item.id ? value : current) });
        return <fieldset key={item.id}><legend>Walkthrough step {index + 1}</legend>
          {field("Step label", item.label, label => update({ ...item, label }), true)}
          <label>Screenshot (project image)<select value={item.screenshotAssetId}
            onChange={event => update({ ...item, screenshotAssetId: event.target.value })}>
            <option value="">Choose a project image</option>
            {item.screenshotAssetId && !imageAssets.some(asset => asset.id === item.screenshotAssetId)
              && <option value={item.screenshotAssetId}>Unavailable image ({item.screenshotAssetId})</option>}
            {imageAssets.map(asset => <option key={asset.id} value={asset.id}>{asset.filename}</option>)}
          </select></label>
          {field("Screenshot alternative text", item.screenshotAltText, screenshotAltText => update({ ...item, screenshotAltText }))}
          {field("What the screenshot shows", item.description, description => update({ ...item, description }))}
          {field("Action prompt", item.actionPrompt, actionPrompt => update({ ...item, actionPrompt }))}
          <button type="button" disabled={index === 0} onClick={() => {
            const steps = [...activity.steps]; [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
            onChange({ ...activity, steps });
          }}>Move walkthrough step {index + 1} up</button>
          <button type="button" disabled={index === activity.steps.length - 1} onClick={() => {
            const steps = [...activity.steps]; [steps[index + 1], steps[index]] = [steps[index], steps[index + 1]];
            onChange({ ...activity, steps });
          }}>Move walkthrough step {index + 1} down</button>
          <button type="button" disabled={activity.steps.length <= 1}
            onClick={() => onChange({ ...activity, steps: activity.steps.filter(step => step.id !== item.id) })}>
            Remove walkthrough step {index + 1}
          </button>
        </fieldset>;
      })}
      <button type="button" disabled={activity.steps.length >= 10} onClick={() => onChange({ ...activity, steps: [...activity.steps, {
        id: id(), label: "New walkthrough step", screenshotAssetId: imageAssets[0]?.id ?? "",
        screenshotAltText: "Describe the visible controls and relevant state.",
        description: "Explain what the screenshot shows.", actionPrompt: "Describe the action to complete.",
      }] })}>Add walkthrough step</button>
    </>}
  </div>;
}
