import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { useSession } from "./AuthGate";
import type { Project } from "./App";

type Account = { id: string; email: string; displayName: string; disabled: boolean };
type Member = { userId: string; role: string };
type ReviewLink = { id: string; url?: string; userId?: string; expiresAt: number; sourceRevision: number };

async function checked<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof body?.detail === "string" ? body.detail : "Project access could not be updated.");
  return body as T;
}

export function ProjectAccessPanel({ project, onClose }: { project: Project; onClose: () => void }) {
  const { session } = useSession();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [links, setLinks] = useState<ReviewLink[]>([]);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState("reviewer");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  const base = `/api/projects/${project.id}`;
  useEffect(() => {
    let alive = true;
    title.current?.focus();
    Promise.all([fetch("/api/accounts").then(checked<Account[]>), fetch(`${base}/members`).then(checked<Member[]>), fetch(`${base}/review-links`).then(checked<ReviewLink[]>)]).then(([a,m,l]) => { if (alive) { setAccounts(a); setMembers(m); setLinks(l); } }).catch(issue => { if (alive) setError(issue instanceof Error ? issue.message : "Project access is unavailable."); });
    return () => { alive = false; };
  }, [base]);

  async function perform(work: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await work(); } catch (issue) { setError(issue instanceof Error ? issue.message : "The request failed."); }
    finally { setBusy(false); }
  }

  return <section data-onboarding="workspace.access" className="project-access-panel" aria-labelledby="project-access-title">
    <button className="button button-outline" onClick={onClose}><ArrowLeft size={16} /> Back to storyboard</button>
    <h2 ref={title} tabIndex={-1} id="project-access-title"><Users size={22} aria-hidden="true" /> Project access · {project.title}</h2>
    <p>Manage who can access and work on this project.</p>
    {error && <p className="auth-error" role="alert">{error}</p>}{message && <p className="auth-message" role="status">{message}</p>}
    <div className="project-access-card">
    <form className="project-access-form" onSubmit={event => { event.preventDefault(); void perform(async () => {
      await checked<Member>(await fetch(`${base}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role }) }));
      setMembers(await checked<Member[]>(await fetch(`${base}/members`))); setMessage("Project membership saved.");
    }); }}>
      <label>Existing account<select value={userId} onChange={event => setUserId(event.target.value)} required disabled={busy}><option value="">Select an account</option>{accounts.filter(account => !account.disabled).map(account => <option key={account.id} value={account.id}>{account.displayName} · {account.email}</option>)}</select></label>
      <label>Project role<select value={role} onChange={event => setRole(event.target.value)} disabled={busy}><option value="reviewer">Reviewer</option><option value="author">Author</option><option value="instructional-designer">Instructional designer</option></select></label>
      <button className="button button-dark" disabled={busy || !userId}>Save member</button>
    </form>
    <h3>Project members</h3><table><thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Actions</th></tr></thead><tbody>{members.map(member => {
      const account = accounts.find(item => item.id === member.userId);
      return <tr key={member.userId}><td>{account?.displayName || member.userId}<br /><small>{account?.email}</small></td><td>{member.role}</td><td><div className="member-actions">
        <button className="button button-outline" disabled={busy} onClick={() => { if (!window.confirm(`Remove ${account?.displayName || "this member"} from the project?`)) return; void perform(async () => { await checked(await fetch(`${base}/members/${member.userId}`, { method: "DELETE" })); setMembers(members.filter(item => item.userId !== member.userId)); setMessage("Project access removed."); }); }}>Remove</button>
        {session?.policy.reviewAccess === "authenticated" && <button className="button button-outline" disabled={busy || account?.disabled} onClick={() => void perform(async () => {
          const link = await checked<ReviewLink>(await fetch(`${base}/review-links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: member.userId, expiresHours: 72 }) })); setLinks([...links, { ...link, userId: member.userId }]); setMessage("Review link created. Share it with the assigned account holder.");
        })}>Create review link</button>}
      </div></td></tr>;
    })}</tbody></table>
    {!members.length && <p>No project members have been assigned.</p>}
    {session?.policy.reviewAccess === "authenticated" && <><h3>Review links</h3><p>Links require the assigned user to sign in, expire after three days, and apply to the current storyboard revision.</p>{links.map(link => <article key={link.id}>
      <p>{accounts.find(item => item.id === link.userId)?.displayName || link.userId} · revision {link.sourceRevision} · expires {new Date(link.expiresAt*1000).toLocaleString()}</p>
      {link.url && <a className="review-link-result" href={link.url}>{link.url}</a>}
      <button className="button button-outline" disabled={busy} onClick={() => void perform(async () => { await checked(await fetch(`${base}/review-links/${link.id}`, { method: "DELETE" })); setLinks(links.filter(item => item.id !== link.id)); setMessage("Review link revoked."); })}>Revoke link</button>
    </article>)}</>}
    </div>
  </section>;
}
