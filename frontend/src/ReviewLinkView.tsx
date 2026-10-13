import { useEffect, useState } from "react";
import { CoursePreview } from "./CoursePreview";
import type { Project } from "./App";

export function ReviewLinkView({ token, onClose }: { token: string; onClose: () => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/reviews/access", { method: "POST", headers: { "X-Review-Token": token }, signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "This review link is unavailable.");
      setProject(data as Project);
    }).catch(issue => { if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "The review could not be opened."); });
    return () => controller.abort();
  }, [token]);
  return project ? <CoursePreview project={project} onClose={onClose} canEnhance={false} /> : <main className="auth-review-error"><h1>Project review</h1>{error ? <p role="alert">{error}</p> : <p role="status">Opening your review…</p>}<button className="button button-outline" onClick={onClose}>Back to workspace</button></main>;
}
