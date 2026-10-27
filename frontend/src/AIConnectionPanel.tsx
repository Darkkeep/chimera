import { useEffect, useState } from "react";
import { Link, Save, Unplug, X } from "lucide-react";
import { EditorDialog } from "./EditorDialog";
import { NarrationConnections } from "./NarrationConnections";
import type { MediaConnectionProvider } from "./NarrationConnections";
import { reportOnboardingOutcome } from "./onboarding-journeys";
import "./ai-connection.css";

type ConnectionStatus = {
  configured: boolean; keyConfigured: boolean; storageAvailable: boolean; credentialError: boolean; canManage: boolean;
  revision: string; source: "saved" | "environment" | "none"; provider: string;
  textModel: string; imageModel: string; audioModel: string; textModels: string[]; imageModels: string[]; audioModels: string[];
  maxRequestsPerDay: number; maxConcurrentRequests: number;
};
const providers: { id: "openai" | MediaConnectionProvider; name: string }[] = [
  { id: "openai", name: "OpenAI" }, { id: "elevenlabs", name: "ElevenLabs" },
  { id: "google-cloud", name: "Google Cloud" }, { id: "cartesia", name: "Cartesia" },
  { id: "synthesia", name: "Synthesia" }, { id: "shotstack", name: "Shotstack" },
];

export function AIConnectionPanel({ onClose, onboardingScope = "workspace" }: { onClose: () => void; onboardingScope?: string }) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [textModel, setTextModel] = useState("gpt-4.1-mini");
  const [imageModel, setImageModel] = useState("gpt-image-1");
  const [audioModel, setAudioModel] = useState("gpt-4o-mini-tts");
  const [apiKey, setApiKey] = useState("");
  const [dailyLimit, setDailyLimit] = useState(20);
  const [concurrentLimit, setConcurrentLimit] = useState(1);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [narrationWorking, setNarrationWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeProvider, setActiveProvider] = useState<"openai" | MediaConnectionProvider>("openai");
  const [narrationDirty, setNarrationDirty] = useState(false);

  function applyStatus(next: ConnectionStatus) {
    setStatus(next);
    setTextModel(next.textModels.includes(next.textModel) ? next.textModel : next.textModels[0]);
    setImageModel(next.imageModels.includes(next.imageModel) ? next.imageModel : next.imageModels[0]);
    setAudioModel(next.audioModels.includes(next.audioModel) ? next.audioModel : next.audioModels[0]);
    setDailyLimit(next.maxRequestsPerDay);
    setConcurrentLimit(next.maxConcurrentRequests);
  }

  useEffect(() => {
    let alive = true;
    fetch("/api/ai-connection").then(async response => {
      if (!response.ok) throw new Error("Media provider settings could not be loaded.");
      return response.json() as Promise<ConnectionStatus>;
    }).then(next => { if (alive) applyStatus(next); }).catch(issue => { if (alive) setError(issue instanceof Error ? issue.message : "Media provider status unavailable."); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const dirty = Boolean(status && (apiKey || textModel !== status.textModel || imageModel !== status.imageModel || audioModel !== status.audioModel || dailyLimit !== status.maxRequestsPerDay || concurrentLimit !== status.maxConcurrentRequests));
  const editable = Boolean(status?.canManage && status.storageAvailable && !narrationWorking);

  function selectProvider(provider: typeof activeProvider) {
    if (provider === activeProvider) return true;
    if (working || narrationWorking) return false;
    if ((activeProvider === "openai" ? dirty : narrationDirty) && !window.confirm("Discard unsaved connection changes and switch provider?")) return false;
    if (activeProvider === "openai" && status) applyStatus(status);
    setApiKey(""); setError(""); setMessage(""); setNarrationDirty(false); setActiveProvider(provider);
    return true;
  }

  function reportProviderOutcome(action: "save" | "test" | "disconnect") {
    reportOnboardingOutcome(`media.provider.${action === "test" ? "tested" : action === "disconnect" ? "disconnected" : "saved"}`, onboardingScope);
  }

  async function requestAction(action: "save" | "test" | "disconnect") {
    if (!status || working || narrationWorking || !status.canManage) return;
    if (action === "disconnect" && !window.confirm("Disconnect the media provider for this installation? Running requests may finish.")) return;
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(action === "save" ? "/api/ai-connection" : `/api/ai-connection/${action}`, {
        method: action === "save" ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "save" ? { expectedRevision: status.revision, provider: "openai", textModel, imageModel, audioModel, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}), maxRequestsPerDay: dailyLimit, maxConcurrentRequests: concurrentLimit } : { expectedRevision: status.revision }),
      });
      const result = await response.json() as ConnectionStatus & { detail?: string; message?: string };
      if (!response.ok) throw new Error(result.detail || "The media provider action could not be completed.");
      if (action === "test") setMessage(result.message || "Connection verified.");
      else { applyStatus(result); setMessage(action === "save" ? "Media provider settings saved." : "Media provider disconnected."); window.dispatchEvent(new Event("chimera:ai-connection-updated")); }
      reportProviderOutcome(action);
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Media provider action failed."); }
    finally { setApiKey(""); setWorking(false); }
  }

  return <EditorDialog onboardingTarget="settings.media" labelledBy="ai-connection-title" onClose={() => { setApiKey(""); onClose(); }} busy={working || narrationWorking} className="ai-connection-dialog">
    <header className="ai-connection-header"><h2 id="ai-connection-title">AI connection</h2><button type="button" className="icon-button" aria-label="Close media provider settings" title="Close media provider settings" disabled={working || narrationWorking} onClick={onClose}><X size={18} /></button></header>
    <div role="tablist" aria-label="AI providers" className="ai-provider-tabs">
      {providers.map((provider, index) => <button key={provider.id} type="button" role="tab" id={`provider-tab-${provider.id}`} aria-controls={`provider-panel-${provider.id}`} aria-selected={activeProvider === provider.id} tabIndex={activeProvider === provider.id ? 0 : -1} disabled={working || narrationWorking} onClick={() => selectProvider(provider.id)} onKeyDown={event => {
        const nextIndex = event.key === "ArrowRight" ? (index + 1) % providers.length : event.key === "ArrowLeft" ? (index + providers.length - 1) % providers.length : event.key === "Home" ? 0 : event.key === "End" ? providers.length - 1 : -1;
        if (nextIndex < 0) return;
        event.preventDefault();
        const next = providers[nextIndex].id;
        if (selectProvider(next)) event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`#provider-tab-${next}`)?.focus();
      }}>{provider.name}</button>)}
    </div>
    <div role="tabpanel" id="provider-panel-openai" aria-labelledby="provider-tab-openai" hidden={activeProvider !== "openai"} tabIndex={0}>
    <h3>OpenAI image / legacy narration</h3>
    {loading ? <p role="status">Loading connection...</p> : status && <>
      <dl className="ai-connection-status"><div><dt>Media provider</dt><dd>{status.configured ? "Configured" : "Not configured"}</dd></div><div><dt>Source</dt><dd>{status.source === "environment" ? "Server environment" : status.source === "saved" ? "Saved connection" : "None"}</dd></div><div><dt>Credential</dt><dd>{status.keyConfigured ? "Configured" : "Credential not stored"}</dd></div></dl>
      {!status.canManage && <p className="ai-connection-notice">Only installation administrators can change media provider settings.</p>}
      {status.canManage && !status.storageAvailable && <p className="ai-connection-notice">Secure credential storage is unavailable for this server account. Saved connections are disabled; server environment configuration remains available.</p>}
      {status.credentialError && <p className="ai-connection-notice">The saved credential could not be read. Check the server credential store.</p>}
      {status.canManage ? <form onSubmit={event => { event.preventDefault(); void requestAction("save"); }}>
        <fieldset disabled={!editable || working} className="ai-connection-fields" aria-label="Media generation provider settings">
          <label>Provider<select value="openai" onChange={() => {}}><option value="openai">OpenAI</option></select></label>
          <label>API key<input type="password" autoComplete="new-password" value={apiKey} maxLength={512} onChange={event => setApiKey(event.target.value)} placeholder={status.keyConfigured ? "Leave blank to keep the configured key" : "Enter API key"} /></label>
          <label>Image model<select value={imageModel} onChange={event => setImageModel(event.target.value)}>{status.imageModels.map(model => <option key={model}>{model}</option>)}</select></label>
          <label>Audio model<select value={audioModel} onChange={event => setAudioModel(event.target.value)}>{status.audioModels.map(model => <option key={model}>{model}</option>)}</select></label>
          <label>Daily request limit<input type="number" min={1} max={1000} value={dailyLimit} onChange={event => setDailyLimit(Number(event.target.value))} /></label>
          <label>Concurrent request limit<input type="number" min={1} max={4} value={concurrentLimit} onChange={event => setConcurrentLimit(Number(event.target.value))} /></label>
        </fieldset>
        <p className="ai-connection-notice">Media generation sends its prompt and selected scene context to the provider and may incur charges. Request limits are not spending limits.</p>
        <footer className="ai-connection-actions"><button type="submit" className="button button-accent" disabled={!editable || working || (!apiKey.trim() && !status.keyConfigured) || !dirty}><Save size={15} />Save media settings</button><button type="button" className="button button-outline" disabled={working || narrationWorking || !status.configured || dirty} onClick={() => void requestAction("test")}><Link size={15} />Test provider</button><button type="button" className="button button-outline" disabled={working || narrationWorking || !status.configured} onClick={() => void requestAction("disconnect")}><Unplug size={15} />Disconnect</button></footer>
      </form> : <dl className="ai-connection-status"><div><dt>Image model</dt><dd>{status.imageModel}</dd></div><div><dt>Audio model</dt><dd>{status.audioModel}</dd></div></dl>}
    </>}
    {error && <p role="alert" className="ai-connection-error">{error}</p>}
    <p role="status" className="ai-connection-message">{working ? "Working..." : message}</p>
    </div>
    {providers.filter(provider => provider.id !== "openai").map(provider => <div key={provider.id} role="tabpanel" id={`provider-panel-${provider.id}`} aria-labelledby={`provider-tab-${provider.id}`} hidden={activeProvider !== provider.id} tabIndex={0}>
      {activeProvider === provider.id && activeProvider !== "openai" && <NarrationConnections key={activeProvider} provider={activeProvider} onBusyChange={setNarrationWorking} onDirtyChange={setNarrationDirty} onActionCompleted={reportProviderOutcome} disabled={working} />}
    </div>)}
  </EditorDialog>;
}