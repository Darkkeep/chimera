import type { AssessmentItem } from "./App";

export function AssessmentStageContent({ item }: { item: AssessmentItem }) {
  const choices = "choices" in item ? item.choices : item.type === "true-false"
    ? [{ identifier: "true", text: "True" }, { identifier: "false", text: "False" }]
    : item.type === "matching" ? item.leftItems : item.type === "drag-drop" ? item.draggables : [];
  const targets = item.type === "matching" ? item.rightItems : item.type === "drag-drop" ? item.targets : [];
  return <section aria-label="Assessment question">
    <h2>{item.prompt}</h2>
    {choices.map((choice, index) => <div className="assessment-stage-choice" key={choice.identifier}>
      <span>{item.type === "ordering" ? `${index + 1}.` : item.type === "multiple-response" ? "[ ]" : "( )"}</span>
      <span>{choice.text}</span>
    </div>)}
    {targets.length > 0 && <div>{targets.map(target => <span className="assessment-stage-target" key={target.identifier}>{target.text}</span>)}</div>}
    {item.type === "short-answer" && <input aria-label="Your answer" disabled placeholder="Your answer" />}
    <button type="button" disabled>Check answer</button>
  </section>;
}