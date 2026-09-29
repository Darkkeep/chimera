import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { Project } from "./App";
import "./enhancement-review.css";

type EnhancementProposal = {
  id: string;
  targetSceneId: string;
  field: "actionDescription";
  beforeValue: string;
  proposedValue: string;
  rationale: string;
  origin: "ai" | "author";
  provider: string | null;
  model: string | null;
  status: "pending" | "accepted" | "rejected" | "stale";
  createdAt: string;
  decidedAt: string | null;
};

type EnhancementProposalResult = { proposal: EnhancementProposal; project: Project | null };

type EnhancementReviewViewProps = {
  project: Project;
  onClose: () => void;
  onProjectUpdated: (project: Project) => void;
};

export function EnhancementReviewView({ project, onClose, onProjectUpdated }: EnhancementReviewViewProps) {
  const [proposals, setProposals] = useState<EnhancementProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyProposalId, setBusyProposalId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`/api/projects/${project.id}/enhancement-proposals`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Enhancement suggestions could not be loaded.");
        return response.json() as Promise<EnhancementProposal[]>;
      })
      .then(setProposals)
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name !== "AbortError") setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [project.id]);

  async function decide(proposalId: string, decision: "accept" | "reject") {
    if (busyProposalId) return;
    setBusyProposalId(proposalId);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/enhancement-proposals/${proposalId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(detail?.detail || "Suggestion could not be reviewed.");
      }
      const result = await response.json() as EnhancementProposalResult;
      setProposals((current) => current.map((proposal) => proposal.id === result.proposal.id ? result.proposal : proposal));
      if (result.project) onProjectUpdated(result.project);
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Suggestion could not be reviewed.");
      if (decisionError instanceof Error && decisionError.message.includes("stale")) {
        setProposals((current) => current.map((proposal) => proposal.id === proposalId ? { ...proposal, status: "stale" } : proposal));
      }
    } finally {
      setBusyProposalId("");
    }
  }

  const pendingCount = proposals.filter((proposal) => proposal.status === "pending").length;

  return <div className="assessment-editor-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !busyProposalId && onClose()}>
    <section className="enhancement-review-dialog" role="dialog" aria-modal="true" aria-labelledby="enhancement-review-title">
      <header className="assessment-editor-header">
        <div><p className="eyebrow">AUTHOR APPROVAL · {pendingCount} PENDING</p><h2 id="enhancement-review-title">Storyboard suggestions</h2></div>
        <button className="icon-button" onClick={onClose} disabled={Boolean(busyProposalId)} aria-label="Close suggestion review"><X size={18} /></button>
      </header>
      {error && <p className="assessment-editor-error enhancement-review-error" role="alert">{error}</p>}
      {loading ? <p className="enhancement-review-empty" role="status">Loading suggestions…</p> : proposals.length === 0
        ? <div className="enhancement-review-empty"><strong>No suggestions yet</strong><span>Enhancements will appear here for individual review. Nothing changes until you accept it.</span></div>
        : <div className="enhancement-proposal-list">{proposals.map((proposal) => {
          const targetScene = project.storyboard.scenes.find((scene) => scene.id === proposal.targetSceneId);
          return <article className={`enhancement-proposal ${proposal.status}`} key={proposal.id}>
            <div className="enhancement-proposal-heading"><div><span className="enhancement-proposal-status">{proposal.status}</span><h3>{targetScene?.title ?? "Scene no longer exists"}</h3><span className="enhancement-proposal-field">Action description</span></div><span className="enhancement-proposal-origin">{proposal.origin === "ai" ? "AI suggestion" : "Author suggestion"}{proposal.provider ? ` · ${proposal.provider}` : ""}{proposal.model ? ` / ${proposal.model}` : ""}</span></div>
            <p className="enhancement-proposal-rationale">{proposal.rationale}</p>
            <dl className="enhancement-proposal-values"><div><dt>Current</dt><dd>{proposal.beforeValue || "Empty"}</dd></div><div><dt>Suggested</dt><dd>{proposal.proposedValue || "Empty"}</dd></div></dl>
            {proposal.status === "pending" && <div className="enhancement-proposal-actions"><button className="button button-outline" onClick={() => void decide(proposal.id, "reject")} disabled={Boolean(busyProposalId)} title="Reject this suggestion without changing the storyboard."><X size={14} /> Reject</button><button className="button button-accent" onClick={() => void decide(proposal.id, "accept")} disabled={Boolean(busyProposalId)} title="Apply this suggestion to the storyboard and save a history snapshot."><Check size={14} /> Accept change</button></div>}
          </article>;
        })}</div>}
    </section>
  </div>;
}