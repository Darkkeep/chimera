import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { EditorDialog } from "./EditorDialog";

type EngineProvider = {
  provider_id: string;
  kind: string;
  enabled: boolean;
  priority: number;
  capabilities: string[];
  models: { model_id: string; priority: number; unit_cost: number }[];
};

type EngineStatus = {
  endpoint?: string;
  available: boolean;
  canViewUsage: boolean;
  health: { status?: string; version?: string };
  capabilities: Record<string, { provider?: string; description?: string }>;
  providerRegistry: {
    budget?: { max_units_per_task?: number; max_concurrent_tasks?: number };
    providers?: EngineProvider[];
  };
  telemetry: { events?: { outcome: string; provider_id?: string; model_id?: string; capability?: string; estimated_units?: number; attempt?: number }[] };
};

export function IntelligenceEnginePanel({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [endpoint, setEndpoint] = useState("http://127.0.0.1:8001");
  const [connecting, setConnecting] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/intelligence-engine").then(async response => {
      if (!response.ok) throw new Error("Pythia status is unavailable.");
      return response.json() as Promise<EngineStatus>;
    }).then(next => { if (alive) { setStatus(next); if (next.endpoint) setEndpoint(next.endpoint); setError(""); } })
      .catch(issue => { if (alive) { setStatus(null); setError(issue instanceof Error ? issue.message : "Pythia status is unavailable."); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refreshKey]);

  const providers = status?.providerRegistry.providers || [];
  const events = status?.telemetry.events || [];

  async function connect() {
    setConnecting(true); setError(""); setConnectionMessage("");
    try {
      const response = await fetch("/api/intelligence-engine/local-connection", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl: endpoint }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "Could not connect to Pythia.");
      setConnectionMessage("Local Engine verified and connection saved.");
      setRefreshKey(value => value + 1);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not connect to Pythia."); }
    finally { setConnecting(false); }
  }

  return <EditorDialog onboardingTarget="settings.engine" labelledBy="intelligence-engine-title" onClose={onClose} busy={loading || connecting} className="ai-connection-dialog">
    <header className="ai-connection-header">
      <h2 id="intelligence-engine-title">Pythia</h2>
      <div className="ai-connection-actions">
        <button type="button" className="icon-button" aria-label="Refresh engine status" title="Refresh engine status" disabled={loading || connecting} onClick={() => setRefreshKey(value => value + 1)}><RefreshCw size={16} /></button>
        <button type="button" className="icon-button" disabled={connecting} aria-label="Close Pythia settings" title="Close Pythia settings" onClick={onClose}><X size={18} /></button>
      </div>
    </header>
    {loading && <p role="status">Checking Engine...</p>}
    {(!status || status.canViewUsage) && <form onSubmit={event => { event.preventDefault(); void connect(); }}>
      <label>Local Pythia Engine address<input type="url" required value={endpoint} maxLength={200} disabled={loading || connecting} onChange={event => setEndpoint(event.target.value)} /></label>
      <p className="field-hint">Use the running Engine's loopback address and port. Installation administrator access is required. Credentials stay on the server.</p>
      <button className="button button-accent" type="submit" disabled={loading || connecting}>{connecting ? "Checking connection…" : "Connect local Pythia"}</button>
    </form>}
    {connectionMessage && <p role="status">{connectionMessage}</p>}
    {status && <>
      <dl className="ai-connection-status">
        <div><dt>Engine</dt><dd>{status.available ? "Available" : "Unavailable"}</dd></div>
        <div><dt>Version</dt><dd>{status.health.version || "Unknown"}</dd></div>
        <div><dt>Capabilities</dt><dd>{Object.keys(status.capabilities).length}</dd></div>
        <div><dt>Enabled providers</dt><dd>{providers.filter(provider => provider.enabled).length}</dd></div>
        <div><dt>Active task limit</dt><dd>{status.providerRegistry.budget?.max_concurrent_tasks ?? "Not reported"}</dd></div>
        <div><dt>Task budget</dt><dd>{status.providerRegistry.budget?.max_units_per_task ?? "Not reported"} units</dd></div>
        {status.canViewUsage
          ? <div><dt>Telemetry events</dt><dd>{events.length}</dd></div>
          : <div><dt>Usage telemetry</dt><dd>Administrator access required</dd></div>}
      </dl>
      <section aria-label="Engine provider registry">
        <strong>Provider registry</strong>
        <dl className="ai-connection-status">{providers.map(provider => <div key={provider.provider_id}>
          <dt>{provider.provider_id}{provider.enabled ? "" : " (disabled)"}</dt>
          <dd>{provider.models.map(model => model.model_id).join(", ")}</dd>
        </div>)}</dl>
      </section>
      <p className="ai-connection-notice">Engine availability verifies the connection. Deterministic providers produce fixture-based suggestions; a model-backed Pythia conversation is a separate capability. Review the provider and capability before submitting work.</p>
      <section aria-label="Engine capabilities">
        <strong>Capabilities</strong>
        <dl className="ai-connection-status">{Object.entries(status.capabilities).map(([capability, definition]) => <div key={capability}>
          <dt>{capability}</dt>
          <dd>{definition.provider || "Engine managed"}</dd>
        </div>)}</dl>
      </section>
      {status.canViewUsage && events.length > 0 && <section aria-label="Recent Engine usage"><strong>Recent usage</strong><dl className="ai-connection-status">{events.slice(-5).reverse().map((event, index) => <div key={`${event.outcome}-${index}`}><dt>{event.capability || "Task"} · {event.outcome}</dt><dd>{event.provider_id || "Engine"}{event.model_id ? ` / ${event.model_id}` : ""}{event.estimated_units === undefined ? "" : ` · ${event.estimated_units} units`}{event.attempt === undefined ? "" : ` · attempt ${event.attempt}`}</dd></div>)}</dl></section>}
      {status.canViewUsage && <p className="ai-connection-notice">Usage telemetry is process-local and resets when the Engine restarts.</p>}
    </>}
    {error && <p role="alert" className="ai-connection-error">{error}</p>}
  </EditorDialog>;
}
