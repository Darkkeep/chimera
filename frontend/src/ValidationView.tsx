import { useEffect, useState } from "react";
import { AlertTriangle, Check, CircleCheck, X } from "lucide-react";
import "./validation.css";
import "./validation-target.css";

type ValidationIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  sceneId: string | null;
  sceneTitle: string | null;
};

type ValidationReport = {
  projectId: string;
  passed: boolean;
  issues: ValidationIssue[];
};

type ValidationViewProps = {
  projectId: string;
  onClose: () => void;
  onOpenScene: (sceneId: string, issueCode: string) => void;
};

export function ValidationView({ projectId, onClose, onOpenScene }: ValidationViewProps) {
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<"authoring" | "production">("authoring");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/projects/${projectId}/validation?target=${target}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Validation could not be run.");
        return response.json() as Promise<ValidationReport>;
      })
      .then(setReport)
      .catch((requestError: unknown) => {
        if (requestError instanceof Error && requestError.name !== "AbortError") setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId, target]);

  const errors = report?.issues.filter((issue) => issue.severity === "error").length ?? 0;
  const warnings = report?.issues.filter((issue) => issue.severity === "warning").length ?? 0;

  return <div className="validation-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="validation-dialog" role="dialog" aria-modal="true" aria-labelledby="validation-title">
      <header className="validation-header">
        <div><p className="eyebrow">{target === "production" ? "PRODUCTION RELEASE GATE" : "PROJECT REVIEW"}</p><h2 id="validation-title">{target === "production" ? "Production readiness" : "Validation"}</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Close validation report"><X size={18} /></button>
      </header>
      <div className="validation-target-switch" role="group" aria-label="Validation target"><button type="button" aria-pressed={target === "authoring"} onClick={() => setTarget("authoring")}>Authoring</button><button type="button" aria-pressed={target === "production"} onClick={() => setTarget("production")}>Production release</button></div>
      {loading ? <p className="validation-message" role="status">Checking storyboard…</p> : error ? <p className="validation-message validation-error" role="alert">{error}</p> : report ? <>
        <div className={`validation-summary ${report.passed ? "is-valid" : "has-errors"}`}>
          {report.passed ? <CircleCheck size={20} /> : <AlertTriangle size={20} />}
          <div><strong>{report.passed ? target === "production" ? "Ready for production release" : "No blocking issues" : target === "production" ? "Production release blocked" : "Review required"}</strong><span>{errors} errors · {warnings} warnings</span></div>
        </div>
        {report.issues.length === 0 ? <div className="validation-empty"><Check size={19} /><span>All current checks passed.</span></div> : <ul className="validation-issues">
          {report.issues.map((issue, index) => <li className={`validation-issue ${issue.severity}`} key={`${issue.code}-${issue.sceneId ?? "project"}-${index}`}>
            <div className="validation-issue-icon">{issue.severity === "error" ? <AlertTriangle size={16} /> : <span>!</span>}</div>
            <div className="validation-issue-copy"><strong>{issue.sceneTitle || "Project"}</strong><span>{issue.message}</span><small>{issue.severity} · {issue.code.replaceAll("-", " ")}</small></div>
            {issue.sceneId && <button type="button" className="validation-open" onClick={() => onOpenScene(issue.sceneId!, issue.code)}>{issue.code === "missing-image-alt-text" ? "Add description" : "Open scene"}</button>}
          </li>)}
        </ul>}
      </> : null}
    </section>
  </div>;
}