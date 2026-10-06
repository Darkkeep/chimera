import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { BrandMark } from "./BrandMark";
import "./authentication.css";

export type Session = { actor: { actorId: string; actorDisplayName: string; deploymentMode: string }; memberships: { role: string }[]; policy: { reviewAccess: string } };
const SessionContext = createContext<{ session: Session | null; logout: () => Promise<void> }>({ session: null, logout: async () => {} });
export const useSession = () => useContext(SessionContext);
export const AUTH_EXPIRED = "chimera:auth-expired";

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { detail?: unknown } | null;
  return typeof body?.detail === "string" ? body.detail : "The request could not be completed. Please try again.";
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<{ deploymentMode: string; identityProvider: string; passwordLoginAvailable: boolean } | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<"login" | "recovery" | "reset">(() => location.hash.startsWith("#reset=") ? "reset" : location.hash === "#recovery" ? "recovery" : "login");
  const resetToken = useRef(location.hash.startsWith("#reset=") ? location.hash.slice(7) : "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const nativeFetch = useRef(window.fetch.bind(window));

  useEffect(() => {
    const changed = () => {
      if (location.hash.startsWith("#reset=")) { resetToken.current = location.hash.slice(7); setMode("reset"); setError(""); setMessage(""); }
      else if (location.hash === "#recovery") setMode("recovery");
    };
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);

  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        const response = await nativeFetch.current("/api/auth/config");
        if (!response.ok) throw new Error(await responseError(response));
        const next = await response.json() as typeof config;
        if (!alive || !next) return;
        setConfig(next);
        if (next.passwordLoginAvailable) {
          const identity = await nativeFetch.current("/api/identity/context");
          if (identity.ok) { const actor = await identity.json() as Session; if (alive) setSession(actor); }
          else if (identity.status !== 401) throw new Error(await responseError(identity));
        }
      } catch (issue) { if (alive) setError(issue instanceof Error ? issue.message : "Sign-in configuration is unavailable."); }
      finally { if (alive) setChecking(false); }
    }
    void check();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!config?.passwordLoginAvailable) return;
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
      if (response.status === 401 && url.origin === location.origin && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/")) {
        window.dispatchEvent(new Event(AUTH_EXPIRED));
      }
      return response;
    };
    const expired = () => { setSession(null); setMode("login"); setPassword(""); setError("Your session expired. Sign in again to continue. Unsaved changes must be re-entered."); };
    window.addEventListener(AUTH_EXPIRED, expired);
    return () => { window.fetch = original; window.removeEventListener(AUTH_EXPIRED, expired); };
  }, [config?.passwordLoginAvailable]);

  useEffect(() => { titleRef.current?.focus(); }, [mode, checking, session]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (mode === "reset" && password !== confirmation) { setError("Passwords do not match."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await nativeFetch.current(`/api/auth/${mode === "reset" ? "reset-password" : "login"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "reset" ? { token: resetToken.current, password } : { email, password }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      if (mode === "reset") {
        resetToken.current = ""; history.replaceState(null, "", location.pathname+location.search);
        setSession(null); setMode("login"); setMessage("Password saved. Sign in with your new password.");
      } else {
        const identity = await nativeFetch.current("/api/identity/context");
        if (!identity.ok) throw new Error(await responseError(identity));
        setSession(await identity.json() as Session);
      }
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Sign-in failed. Please try again."); }
    finally { setBusy(false); setPassword(""); setConfirmation(""); setVisible(false); }
  }

  async function logout() {
    const response = await nativeFetch.current("/api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error(await responseError(response));
    setSession(null); setMode("login"); setMessage("You have signed out.");
  }

  if (!checking && config?.identityProvider === "local" && config.deploymentMode === "single-user") return <SessionContext.Provider value={{ session: null, logout }}>{children}</SessionContext.Provider>;
  if (!checking && session && mode !== "reset") return <SessionContext.Provider value={{ session, logout }}>{children}</SessionContext.Provider>;
  const unavailable = !config?.passwordLoginAvailable;
  return <main className="auth-screen">
    <header className="auth-brand"><div><BrandMark className="auth-brand-mark" /><span>CHIMERA</span></div><p>Turn presentations into purposeful learning.</p></header>
    <section className={`auth-card ${mode === "recovery" ? "auth-recovery" : ""}`} aria-labelledby="auth-title">
      {mode === "recovery" && <div className="auth-recovery-icon"><Mail size={64} aria-hidden="true" /><ShieldCheck size={30} aria-hidden="true" /></div>}
      <h1 id="auth-title" ref={titleRef} tabIndex={-1}>{checking ? "Connecting to Chimera" : unavailable ? "Sign-in unavailable" : mode === "reset" ? "Reset your password" : mode === "recovery" ? "Request a password reset link" : "Sign in to Chimera"}</h1>
      {error && <p className="auth-error" role="alert">{error}</p>}
      {message && <p className="auth-message" role="status">{message}</p>}
      {checking ? <p role="status">Checking your workspace…</p> : unavailable ? <><p>Your installation’s sign-in provider is not ready. Contact your administrator.</p><button className="auth-submit" onClick={() => location.reload()}>Try again</button></> : mode === "recovery" ? <><p>Contact your administrator to request a secure password reset link. Account recovery is administrator-managed.</p><button className="auth-submit" onClick={() => { setMode("login"); setError(""); }}>Back to sign in</button></> : <form onSubmit={(event) => void submit(event)} aria-busy={busy}>
        {mode === "reset" && <p className="auth-help">Use a passphrase of at least 15 characters.</p>}
        {mode === "login" && <label className="auth-field">Email<div className="auth-input"><Mail size={20} aria-hidden="true" /><input type="email" autoComplete="username" maxLength={254} placeholder="you@domain.com" value={email} required disabled={busy} onChange={(event) => setEmail(event.target.value)} /></div></label>}
        <label className="auth-field">{mode === "reset" ? "New password" : "Password"}<div className="auth-input"><LockKeyhole size={20} aria-hidden="true" /><input type={visible ? "text" : "password"} autoComplete={mode === "reset" ? "new-password" : "current-password"} minLength={mode === "reset" ? 15 : 1} maxLength={1024} placeholder={mode === "reset" ? "Enter new password" : "Enter your password"} value={password} required disabled={busy} onChange={(event) => setPassword(event.target.value)} /><button type="button" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></label>
        {mode === "reset" && <label className="auth-field">Confirm password<div className="auth-input"><LockKeyhole size={20} aria-hidden="true" /><input type={visible ? "text" : "password"} autoComplete="new-password" minLength={15} maxLength={1024} value={confirmation} required disabled={busy} onChange={(event) => setConfirmation(event.target.value)} /></div></label>}
        <button className="auth-submit" disabled={busy} type="submit">{busy ? "Please wait…" : mode === "reset" ? "Save password" : "Sign in"}</button>
        <button className="auth-link" type="button" disabled={busy} onClick={() => { if (mode === "reset") { resetToken.current = ""; history.replaceState(null, "", location.pathname+location.search); setMode("login"); } else setMode("recovery"); setError(""); }}>{mode === "reset" ? "Back to sign in" : "Forgot password?"}</button>
        <p className="auth-footnote">{mode === "reset" ? "Reset links expire after 15 minutes and can be used once." : "Account access is managed by your administrator."}</p>
      </form>}
    </section>
  </main>;
}
