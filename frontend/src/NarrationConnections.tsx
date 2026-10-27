import { useEffect, useState } from "react";

export type MediaConnectionProvider = "elevenlabs" | "google-cloud" | "cartesia" | "synthesia" | "shotstack";
const providerNames: Record<MediaConnectionProvider, string> = { elevenlabs: "ElevenLabs", "google-cloud": "Google Cloud", cartesia: "Cartesia", synthesia: "Synthesia", shotstack: "Shotstack" };
type CredentialSource = "secure-store" | "environment" | "adc";
type Connection = {
  id: string; name: string; provider: MediaConnectionProvider; credentialSource: CredentialSource; environment?: "stage" | "v1";
  voice: string; model: string; language: string; projectId: string; configured: boolean; credentialError: boolean;
};
type Collection = { revision: string; canManage: boolean; storageAvailable: boolean; connections: Connection[]; legacyConfigured: boolean };
type Discovery = { message?: string; has_more?: boolean; voices: { id: string; name: string; language?: string }[]; models: { id: string; name: string }[] };
const emptyForm = (provider: MediaConnectionProvider) => ({ name: "", provider, credentialSource: (provider === "google-cloud" ? "adc" : "secure-store") as CredentialSource, voice: "", model: provider === "elevenlabs" ? "eleven_multilingual_v2" : provider === "cartesia" ? "sonic-3.6" : "", language: "en-US", projectId: "", environment: "stage" as "stage" | "v1" });

export function NarrationConnections({ provider = "elevenlabs", onBusyChange, onDirtyChange, disabled = false }: { provider?: MediaConnectionProvider; onBusyChange: (busy: boolean) => void; onDirtyChange?: (dirty: boolean) => void; disabled?: boolean }) {
  const [collection, setCollection] = useState<Collection | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(() => emptyForm(provider));
  const [apiKey, setApiKey] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const selected = collection?.connections.find(connection => connection.id === selectedId);
  const video = provider === "synthesia" || provider === "shotstack";
  const kind = video ? "video" : "narration";
  const environmentVariable = provider === "shotstack" ? (form.environment === "v1" ? "SHOTSTACK_PRODUCTION_API_KEY" : "SHOTSTACK_SANDBOX_API_KEY") : `${provider.toUpperCase()}_API_KEY`;
  const dirty = selected ? Object.entries(form).some(([key, value]) => value !== (key === "environment" ? selected.environment || "stage" : selected[key as keyof Connection])) || Boolean(apiKey) : Object.entries(form).some(([key, value]) => value !== emptyForm(provider)[key as keyof typeof form]) || Boolean(apiKey);
  const editable = Boolean(collection?.canManage && !working && !disabled);
  const canSave = editable && form.name.trim() && dirty &&
    (form.credentialSource !== "secure-store" || (collection?.storageAvailable && (apiKey.trim() || (selected?.configured && selected.provider === form.provider && selected.credentialSource === "secure-store" && (provider !== "shotstack" || (selected.environment || "stage") === form.environment)))));

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  function choose(connection?: Connection) {
    setSelectedId(connection?.id || "");
    setForm(connection ? { name: connection.name, provider: connection.provider, credentialSource: connection.credentialSource, voice: connection.voice, model: connection.model || "", language: connection.language || "en-US", projectId: connection.projectId || "", environment: connection.environment || "stage" } : emptyForm(provider));
    setApiKey(""); setDiscovery(null); setMessage(""); setError("");
  }

  useEffect(() => {
    let alive = true;
    fetch("/api/narration-connections").then(async response => {
      if (!response.ok) throw new Error();
      return response.json() as Promise<Collection>;
    }).then(result => { if (alive) setCollection(result); }).catch(() => { if (alive) setError("Provider connections could not be loaded."); });
    return () => { alive = false; };
  }, []);

  async function act(action: "save" | "test" | "disconnect") {
    if (!collection || !editable || (action === "save" ? !canSave : !selected)) return;
    if (action === "disconnect" && !window.confirm(`Disconnect ${kind} connection "${selected!.name}"? Running requests may finish.`)) return;
    setWorking(true); onBusyChange(true); setError(""); setMessage("");
    let failureMessage = "The narration connection action could not be completed. Check the server configuration and try again.";
    try {
      const response = await fetch(action === "save" ? "/api/narration-connections" : `/api/narration-connections/${encodeURIComponent(selectedId)}/${action}`, {
        method: action === "save" ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "save" ? {
          expectedRevision: collection.revision, ...(selectedId ? { id: selectedId } : {}),
          name: form.name.trim(), provider, credentialSource: form.credentialSource, voice: form.voice.trim(), model: form.model, language: form.language.trim() || "en-US", projectId: form.projectId,
          ...(provider === "shotstack" ? { environment: form.environment } : {}),
          ...(form.credentialSource === "secure-store" && apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        } : { expectedRevision: collection.revision }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { detail?: unknown } | null;
        if (typeof result?.detail === "string" && result.detail.trim()) failureMessage = result.detail;
        else if (response.status === 409) failureMessage = "Narration settings changed. Close and reopen settings before trying again.";
        throw new Error();
      }
      if (action === "test") {
        const result = await response.json() as Discovery;
        setDiscovery({ voices: result.voices || [], models: result.models || [] });
        setMessage([result.message || "Connection test completed.", result.has_more ? "Only the first 100 voices are shown; more voices are available." : "", video ? "" : "Discovery does not generate audio or prove synthesis access."].filter(Boolean).join(" "));
      } else {
        const next = await response.json() as Collection;
        setCollection(next);
        choose(action === "save" ? next.connections.find(connection => selectedId ? connection.id === selectedId : !collection.connections.some(previous => previous.id === connection.id)) : undefined);
        setMessage(`${video ? "Video" : "Narration"} connection ${action === "save" ? "saved" : "disconnected"}.`);
        window.dispatchEvent(new Event("chimera:ai-connection-updated"));
      }
    } catch { setError(failureMessage); }
    finally { setApiKey(""); setWorking(false); onBusyChange(false); }
  }

  return <section aria-labelledby="narration-connections-title">
    <h3 id="narration-connections-title">{video ? "Video connections" : "Narration connections"}</h3>
    <p className="ai-connection-notice">{providerNames[provider]}: {video ? "secure connection setup and read-only testing only. Video generation is not yet available in Chimera." : "MP3 narration with voice discovery."} Credentials are never displayed.</p>
    {!collection && !error && <p>Loading provider connections...</p>}
    {collection && <>
      {collection.legacyConfigured && <p className="ai-connection-notice">Legacy OpenAI narration is also available in the media library.</p>}
      {!collection.canManage ? <>
        <p className="ai-connection-notice">Only installation administrators can change {kind} connections.</p>
        <ul>{collection.connections.filter(connection => connection.provider === provider).map(connection => <li key={connection.id}>{connection.name} · {connection.configured ? "Configured" : "Not configured"}{connection.credentialError ? " · Credential unavailable" : ""}</li>)}</ul>
      </> : <form onSubmit={event => { event.preventDefault(); void act("save"); }}>
        <fieldset className="ai-connection-fields" disabled={!editable} aria-label={`${video ? "Video" : "Narration"} connection settings`}>
          <label>Saved {kind} connection<select value={selectedId} onChange={event => choose(collection.connections.find(connection => connection.id === event.target.value))}><option value="">New connection</option>{collection.connections.filter(connection => connection.provider === provider).map(connection => <option value={connection.id} key={connection.id}>{connection.name}</option>)}</select></label>
          <label>Connection name<input required maxLength={100} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
          <label>{video ? "Video" : "Narration"} provider<select value={provider} disabled><option value={provider}>{providerNames[provider]}</option></select></label>
          <label>Credential source<select value={form.credentialSource} onChange={event => { setForm({ ...form, credentialSource: event.target.value as CredentialSource }); setApiKey(""); }}>
            {form.provider === "google-cloud" ? <option value="adc">Application Default Credentials (ADC)</option> : <><option value="secure-store">Secure credential store</option><option value="environment">Server environment ({environmentVariable})</option></>}
          </select></label>
          {form.provider !== "google-cloud" && form.credentialSource === "secure-store" && <label>{providerNames[provider]} API key<input type="password" autoComplete="new-password" maxLength={512} disabled={!collection.storageAvailable} value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={selected?.configured ? "Leave blank to keep the configured key" : "Enter API key"} /></label>}
          {provider === "shotstack" && <label>Shotstack environment<select value={form.environment} onChange={event => { setForm({ ...form, environment: event.target.value as "stage" | "v1" }); setApiKey(""); }}><option value="stage">Sandbox (stage)</option><option value="v1">Production (v1)</option></select></label>}
          {!video && <label>Narration voice<input list="narration-discovered-voices" value={form.voice} onChange={event => setForm({ ...form, voice: event.target.value })} /></label>}
          {(form.provider === "elevenlabs" || form.provider === "cartesia") && <label>Narration model<input list="narration-discovered-models" value={form.model} onChange={event => setForm({ ...form, model: event.target.value })} /></label>}
          {!video && <label>Narration language<input value={form.language} onChange={event => setForm({ ...form, language: event.target.value })} placeholder="en-US" /></label>}
          {form.provider === "google-cloud" && <label>Project / quota project ID (optional)<input value={form.projectId} onChange={event => setForm({ ...form, projectId: event.target.value })} /></label>}
        </fieldset>
        {form.provider === "google-cloud" && <p className="ai-connection-notice">Google uses the server's Application Default Credentials (ADC). No Google key is entered here. The selected voice determines the model.</p>}
        {form.provider === "elevenlabs" && <p className="ai-connection-notice">For ElevenLabs, language is saved as narration metadata; spoken language may be autodetected by the selected voice and model.</p>}
        {provider === "cartesia" && <p className="ai-connection-notice">Cartesia API version 2026-08-14; default model sonic-3.6. Test discovers voices only, not model access.</p>}
        {form.credentialSource === "environment" && <p className="ai-connection-notice">The backend reads {environmentVariable} from its server environment. Provision it through your service or secret manager, never a browser/Vite variable.</p>}
        {!collection.storageAvailable && <p className="ai-connection-notice">Secure credential storage is unavailable. Use server environment credentials or Google ADC.</p>}
        {selected && <p className="ai-connection-notice">{selected.configured ? "Configured" : "Not configured"}{selected.credentialError ? " · The credential could not be read. Check the server credential configuration." : ""}</p>}
        {video ? <p className="ai-connection-notice">{provider === "shotstack" ? "Sandbox and production need different keys. Test reads saved templates; it does not render or generate AI assets." : "Test reads video-list metadata and discards it; it does not create a video. Your account must have API access."} No course content is sent by this test.</p> : <p className="ai-connection-notice">Output format: MP3. Save credentials, then Test narration connection to discover voices. Select a voice and Save again before generation. Connections without a voice are not offered in the media library.</p>}
        {discovery && !video && <div>
          <h4>Discovered voices and models</h4>
          <datalist id="narration-discovered-voices">{discovery.voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name} {voice.language || ""}</option>)}</datalist>
          <datalist id="narration-discovered-models">{discovery.models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</datalist>
          <ul>{discovery.voices.map(voice => <li key={voice.id}>{voice.name} — {voice.id}{voice.language ? ` (${voice.language})` : ""}</li>)}{discovery.models.map(model => <li key={model.id}>{model.name} — {model.id}</li>)}</ul>
        </div>}
        <footer className="ai-connection-actions">
          <button type="submit" className="button button-accent" disabled={!canSave}>Save {kind} connection</button>
          <button type="button" className="button button-outline" disabled={!editable || !selected?.configured || dirty} onClick={() => void act("test")}>Test {kind} connection</button>
          <button type="button" className="button button-outline" disabled={!editable || !selected} onClick={() => void act("disconnect")}>Disconnect {kind} connection</button>
        </footer>
      </form>}
    </>}
    {error && <p role="alert" className="ai-connection-error">{error}</p>}
    {(working || message) && <p role="status" className="ai-connection-message">{working ? "Working on provider connection..." : message}</p>}
  </section>;
}
