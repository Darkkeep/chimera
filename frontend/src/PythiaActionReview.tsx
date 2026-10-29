export type ContentSceneDraft = { title: string; sceneType: "content" | "title" | "summary"; extractedText: string[]; narration: string; actionDescription: string; notes: string };
export type PythiaAction = { id: string; turnId: string; mode: "update-scene" | "add-scenes"; sceneId: string | null; direction: string; sourceRevision: number;
  before: Record<string, string | string[]> | null; status: "drafting" | "pending" | "applied" | "discarded" | "failed";
  appliedRevision?: number; error: string | null; result: { rationale: string; producer_id: string; changes: { field: string; value: string | string[] }[]; scenes: ContentSceneDraft[] } | null };

const labels: Record<string, string> = { title: "Title", extractedText: "Screen text", narration: "Narration", actionDescription: "Production direction", notes: "Author notes" };
const text = (value: string | string[] | undefined) => Array.isArray(value) ? value.join("\n\n") : value || "(empty)";

export function PythiaActionReview({ action, revision, disabled, onDecision, onRedraft }: { action: PythiaAction; revision: number; disabled: boolean;
  onDecision: (action: PythiaAction, decision: "apply" | "discard") => void; onRedraft: (action: PythiaAction) => void }) {
  const stale = action.status === "pending" && action.sourceRevision !== revision;
  return <section className="pythia-action-review" aria-label={`Content draft ${action.id}`}>
    <h3>{action.mode === "update-scene" ? "Proposed scene update" : "Proposed new content scenes"} <span>{action.status}</span></h3>
    <p>Source revision {action.sourceRevision}{action.before?.title ? ` · Target: ${action.before.title}` : " · Append to this project"}</p>
    <details><summary>Author direction used</summary><p>{action.direction}</p></details>
    {action.status === "drafting" && <p role="status">Pythia is preparing a content draft. No changes have been applied.</p>}
    {action.error && <p role="alert">{action.error}</p>}
    {action.result && <>
      <p>{action.result.rationale}</p>
      {action.result.changes.map(change => <section className="pythia-action-field" key={change.field}><h4>{labels[change.field] || change.field}</h4><div className="pythia-action-diff"><div><strong>Before</strong><p>{text(action.before?.[change.field])}</p></div><div><strong>After</strong><p>{text(change.value)}</p></div></div></section>)}
      {action.result.scenes.map((scene, index) => <section className="pythia-action-new-scene" key={index}><h4>{index + 1}. {scene.title}</h4><small>{scene.sceneType}</small>{scene.extractedText.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
        {(scene.narration || scene.notes || scene.actionDescription) && <details><summary>Narration and production notes</summary>{scene.narration && <p><strong>Narration</strong>{"\n"}{scene.narration}</p>}{scene.actionDescription && <p><strong>Production direction</strong>{"\n"}{scene.actionDescription}</p>}{scene.notes && <p><strong>Author notes</strong>{"\n"}{scene.notes}</p>}</details>}
      </section>)}
      <small>Producer: {action.result.producer_id}</small>
    </>}
    {stale && <p role="alert">The storyboard is now revision {revision}. Request a new draft before applying changes.</p>}
    {action.status === "pending" && <div className="pythia-action-buttons"><button type="button" className="button button-accent" disabled={disabled || stale} onClick={() => onDecision(action, "apply")}>Apply changes</button><button type="button" className="button button-outline" disabled={disabled} onClick={() => onDecision(action, "discard")}>Discard draft</button></div>}
    {(stale || action.status === "failed") && <button className="button button-outline" type="button" disabled={disabled} onClick={() => onRedraft(action)}>Prepare a new draft</button>}
    {action.status === "applied" && <p role="status">Applied to storyboard revision {action.appliedRevision}. The scene editor and preview use the updated content.</p>}
  </section>;
}
