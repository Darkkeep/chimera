import { useEffect, useRef, useState } from "react";
import { mountHTML5Activity } from "../../backend/app/static/html5-activity.js";

export type HTML5Activity = { assetId: string; title: string; alternative: string; tracking: "view" | "completion" | "scored"; scoreWeight: number };
export type HTML5Progress = { assetId: string; completed: boolean; score: number | null; suspendData: string; location: string };
export function HTML5Player({ projectId, activity, progress, onProgress }: {
  projectId: string; activity: HTML5Activity; progress?: HTML5Progress; onProgress?: (value: HTML5Progress) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const saved = useRef(progress), changed = useRef(onProgress);
  saved.current = progress; changed.current = onProgress;
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let cleanup: (() => void) | undefined;
    setError("");
    fetch(`/api/projects/${projectId}/assets/${activity.assetId}`).then(async response => {
      if (!response.ok) throw new Error(`Activity could not load (${response.status}).`);
      const data = await response.json();
      if (active && root.current) cleanup = mountHTML5Activity(root.current, activity, data, {
        progress: saved.current, onProgress: value => changed.current?.(value),
      });
    }).catch(issue => { if (active) setError(issue instanceof Error ? issue.message : "Activity could not load."); });
    return () => { active = false; cleanup?.(); };
  }, [projectId, activity]);
  return <div>{error && <p role="alert">{error}</p>}<div ref={root} /></div>;
}
