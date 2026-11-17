import { useEffect, useState } from "react";

type BuildPart = { gitSha: string | null; builtAt: string | null };
type BuildDetails = {
  version: string | null;
  backend: BuildPart;
  frontend: BuildPart;
  environment: string | null;
  pythiaContractVersion: string | null;
};

const buildSha = import.meta.env.VITE_CHIMERA_BUILD_SHA || null;
const buildTime = import.meta.env.VITE_CHIMERA_BUILD_TIMESTAMP || null;
const buildEnvironment = import.meta.env.VITE_CHIMERA_BUILD_ENVIRONMENT || null;

function Value({ value }: { value?: string | null }) {
  return <span>{value || "Unknown (not supplied by deployment)"}</span>;
}

export function BuildInformation() {
  const [info, setInfo] = useState<BuildDetails | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError("");
    fetch("/api/management/build-information", { signal: controller.signal, credentials: "same-origin", cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error(response.status === 403 ? "Administrator permission is required." : "Build identity is unavailable.");
        return response.json() as Promise<BuildDetails>;
      })
      .then(setInfo)
      .catch(issue => { if (!controller.signal.aborted) setError(issue instanceof Error ? issue.message : "Build identity unavailable."); });
    return () => controller.abort();
  }, [open]);

  const mismatch = Boolean(info?.backend.gitSha && buildSha && info.backend.gitSha !== buildSha);

  return <section className="chimera-build-information" aria-label="Build Information">
    <button className="nav-item" type="button" aria-expanded={open}
      aria-controls="chimera-build-details" onClick={() => setOpen(value => !value)}>
      Build Information
    </button>
    {open && <div id="chimera-build-details" role="region" aria-label="Build provenance" style={{ padding: "0.5rem 0.75rem", overflowWrap: "anywhere" }}>
      {error ? <p role="alert">{error}</p> : !info ? <p role="status">Checking deployed build…</p> : <>
        <dl>
          <dt>Chimera version</dt><dd><Value value={info.version} /></dd>
          <dt>Backend Git commit</dt><dd><Value value={info.backend.gitSha} /></dd>
          <dt>Frontend Git commit</dt><dd><Value value={buildSha} /></dd>
          <dt>Backend built at (UTC)</dt><dd><Value value={info.backend.builtAt} /></dd>
          <dt>Frontend built at (UTC)</dt><dd><Value value={buildTime} /></dd>
          <dt>Environment</dt><dd><Value value={info.environment || buildEnvironment} /></dd>
          <dt>Pythia contract</dt><dd><Value value={info.pythiaContractVersion} /></dd>
        </dl>
        {mismatch && <p role="alert">Frontend and backend Git commits differ. Verify the deployed release before diagnosing behavior.</p>}
        {!mismatch && (!info.backend.gitSha || !buildSha) && <p>Deployment identity is incomplete; a matching version label does not prove both builds match.</p>}
      </>}
    </div>}
  </section>;
}
