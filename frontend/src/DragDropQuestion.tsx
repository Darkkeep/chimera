import { useRef, useState } from "react";
import type { DragEvent } from "react";
import type { AssessmentItem } from "./App";

type DragDropQuestionProps = {
  item: Extract<AssessmentItem, { type: "drag-drop" }>;
  matches: Record<string, string>;
  disabled: boolean;
  onMatch: (source: string, target: string) => void;
};

export function DragDropQuestion({ item, matches, disabled, onMatch }: DragDropQuestionProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const rejectedDrop = useRef(false);

  function place(sourceId: string, targetId: string) {
    if (disabled) return;
    const source = item.draggables.find(choice => choice.identifier === sourceId);
    const target = item.targets.find(choice => choice.identifier === targetId);
    if (!source || !target) return;
    if (!item.correctMatches.some(pair => pair.sourceIdentifier === sourceId && pair.targetIdentifier === targetId)) {
      rejectedDrop.current = true;
      setSelected(null);
      setMessage(`${source.text} does not belong beside ${target.text}. It has returned home. Try again.`);
      return;
    }
    onMatch(sourceId, targetId);
    setSelected(null);
    setMessage(`${source.text} placed beside ${target.text}.`);
  }

  function finishDrag(event: DragEvent<HTMLButtonElement>) {
    if (!rejectedDrop.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    rejectedDrop.current = false;
    const button = event.currentTarget;
    const home = button.getBoundingClientRect();
    button.animate([
      { transform: `translate(${event.clientX - home.x - home.width / 2}px, ${event.clientY - home.y - home.height / 2}px)` },
      { transform: "translate(0, 0)" },
    ], { duration: 350, easing: "ease-out" });
  }

  return <div className="course-preview-drag-question">
    <p className="course-preview-drag-instructions">Drag a tile beside its matching label, or select a tile and then a target. Incorrect tiles return home without using an attempt.</p>
    <div className="course-preview-draggables" role="group" aria-label="Draggable answers">
      {item.draggables.filter(source => !matches[source.identifier]).map(source => <button
        type="button" className="course-preview-drag-chip" key={source.identifier}
        draggable={!disabled} disabled={disabled} aria-pressed={selected === source.identifier}
        onClick={() => { setSelected(selected === source.identifier ? null : source.identifier); setMessage(""); }}
        onDragStart={event => {
          rejectedDrop.current = false;
          event.dataTransfer.setData("text/plain", source.identifier);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={finishDrag}
      >{source.text}</button>)}
      {item.draggables.every(source => matches[source.identifier]) && <span>All tiles placed.</span>}
    </div>
    <div className="course-preview-drop-targets" role="group" aria-label="Drop targets">
      {item.targets.map(target => {
        const placed = item.draggables.find(source => matches[source.identifier] === target.identifier);
        return <div className="course-preview-drop-target" key={target.identifier}
          onDragOver={event => { if (!disabled) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }}
          onDrop={event => {
            event.preventDefault();
            place(event.dataTransfer.getData("text/plain"), target.identifier);
          }}
        >
          <strong>{target.text}</strong>
          <button type="button" className={`course-preview-drop-slot${placed ? " course-preview-drag-chip" : ""}`}
            aria-label={`Place selected tile beside ${target.text}`} disabled={disabled}
            aria-disabled={disabled || !selected || Boolean(placed)}
            onClick={() => { if (selected && !placed) place(selected, target.identifier); }}
          >{placed ? placed.text : "Drop a tile here"}</button>
        </div>;
      })}
    </div>
    <p className="course-preview-drag-status" role="status" aria-live="polite">{message}</p>
  </div>;
}
