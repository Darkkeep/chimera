import { useState, type FormEvent } from "react";
import { MessageSquareWarning, X } from "lucide-react";
import "./signal-feedback.css";

type Kind = "problem" | "confusing" | "idea" | "praise";

/** Reusable component: change product/version when installed elsewhere. */
export function SignalFeedback({ product = "chimera", version = "1.2.0" }: { product?: string; version?: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("problem");
  const [description, setDescription] = useState("");
  const [technical, setTechnical] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || description.trim().length < 10) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/signal/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product, kind, description: description.trim(),
          includeTechnicalContext: technical,
          ...(technical ? {
            // Keep only pathname, never query/hash or document content.
            version,
            page: window.location.pathname,
            browser: navigator.userAgent.slice(0, 120),
          } : {}),
        }),
      });
      if (!response.ok) throw new Error(response.status === 429 ? "Too many reports have been sent. Please try later." : "Your report could not be sent. Please try again.");
      const result = await response.json() as { id: string };
      setReceipt(result.id);
      setDescription("");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not send feedback.");
    } finally { setBusy(false); }
  }

  return (
    <div className="signal-root">
      {open && <section className="signal-panel" role="dialog" aria-modal="false" aria-label="Help and feedback">
        <header className="signal-panel-header"><div><span className="signal-eyebrow">DARKROGUE SIGNAL</span><h2>Help & Feedback</h2></div>
          <button className="signal-close" type="button" aria-label="Close feedback" onClick={() => setOpen(false)}><X size={18}/></button>
        </header>
        {receipt ? <div className="signal-success" role="status"><strong>Report received.</strong><p>Thank you for helping us improve Chimera. Your reference is <code>{receipt}</code>.</p><button type="button" onClick={() => { setReceipt(""); setOpen(false); }}>Done</button></div>
        : <form onSubmit={submit}>
          <p className="signal-intro">Something not right? Tell us what happened. No debugging expertise required.</p>
          <label htmlFor="signal-kind">I'm reaching out because</label>
          <select id="signal-kind" value={kind} onChange={e => setKind(e.target.value as Kind)}>
            <option value="problem">Something isn't working</option>
            <option value="confusing">I'm stuck or confused</option>
            <option value="idea">I have an idea</option>
            <option value="praise">Something worked well</option>
          </select>
          <label htmlFor="signal-description">What happened?</label>
          <textarea id="signal-description" required minLength={10} maxLength={4000} rows={4} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="What were you trying to do, and what happened instead?"/>
          <label className="signal-check"><input type="checkbox" checked={technical} onChange={e => setTechnical(e.target.checked)}/> Include page, browser, and app version</label>
          <p className="signal-privacy">Please don't include passwords, personal data, protected training content, or consultation text. Files and screenshots are not sent.</p>
          {error && <p className="signal-error" role="alert">{error}</p>}
          <button className="signal-submit" type="submit" disabled={busy || description.trim().length < 10}>{busy ? "Sending…" : "Send feedback"}</button>
        </form>}
      </section>}
      <button type="button" className="signal-launcher" aria-expanded={open} onClick={() => { setOpen(!open); setError(""); }}>
        <MessageSquareWarning size={17}/><span>Help & Feedback</span>
      </button>
    </div>
  );
}
