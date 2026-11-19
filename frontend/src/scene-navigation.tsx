import { useEffect, useRef, useState } from "react";
import { EditorDialog } from "./EditorDialog";

export type SceneNavigationState = { dirty: boolean; busy: boolean; save: () => Promise<boolean>; discard: () => void };

/** One guard for scene drafts; persistence remains owned by the existing editor. */
export function useSceneNavigation() {
  const editor = useRef<SceneNavigationState | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const register = useRef((state: SceneNavigationState | null) => { editor.current = state; }).current;
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!editor.current?.dirty) return;
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, []);
  function request(action: () => void) {
    if (pending || editor.current?.busy) return;
    if (editor.current?.dirty) { setError(""); setPending(() => action); }
    else { editor.current?.discard(); action(); }
  }
  function keepEditing() { if (!saving) { setPending(null); setError(""); } }
  async function finish(save: boolean) {
    if (!pending || saving) return;
    setSaving(true); setError("");
    try {
      if (save && editor.current && !await editor.current.save()) {
        setError("The scene was not saved. Your draft is preserved. Resolve the editor error, or keep editing.");
        return;
      }
      if (!save) editor.current?.discard();
      const action = pending;
      setPending(null);
      action();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Save failed. Your draft is preserved."); }
    finally { setSaving(false); }
  }
  const prompt = pending && <EditorDialog labelledBy="unsaved-scene-title" onClose={keepEditing} busy={saving} className="unsaved-scene-dialog">
    <h2 id="unsaved-scene-title">Unsaved scene changes</h2>
    <p>Save this scene before continuing, discard the draft, or keep editing.</p>
    {error && <p role="alert">{error}</p>}
    <div className="modal-actions">
      <button type="button" className="button button-accent" disabled={saving} onClick={() => void finish(true)}>{saving ? "Saving…" : "Save changes"}</button>
      <button type="button" className="button button-outline" disabled={saving} onClick={() => void finish(false)}>Discard changes</button>
      <button type="button" className="button button-outline" disabled={saving} onClick={keepEditing}>Keep editing</button>
    </div>
  </EditorDialog>;
  return { register, request, prompt };
}
