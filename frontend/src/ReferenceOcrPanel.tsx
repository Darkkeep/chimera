import { useEffect, useState } from "react";

export type OcrResource = { id: string; title: string; currentVersion: string; versions: { version: string; filename: string; extractionStatus: string; extractionMessage: string | null; passages: { locator: string; text: string }[] }[] };

export function ReferenceOcrPanel({ projectId, resources, onUpdated }: { projectId: string; resources: OcrResource[]; onUpdated: (r: OcrResource) => void }) {
  const [capability, setCapability] = useState<{ available: boolean; languages: string[]; message: string } | null>(null);
  const [language, setLanguage] = useState("eng");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { const controller = new AbortController(); fetch(`/api/projects/${projectId}/media-capabilities`, { signal: controller.signal }).then(async r => { if (!r.ok) throw new Error("OCR status is unavailable."); return r.json(); }).then(data => { setCapability(data.ocr); setLanguage(data.ocr.languages.includes("eng") ? "eng" : data.ocr.languages[0] || "eng"); }).catch(e => { if (e.name !== "AbortError") setError(e.message); }); return () => controller.abort(); }, [projectId]);
  async function run(resource: OcrResource, accept = false) {
    if (busy) return;
    setBusy(resource.id); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/reference-resources/${resource.id}/ocr${accept ? "/accept" : ""}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedVersion: resource.currentVersion, language }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "OCR failed. The previous source version is retained.");
      onUpdated(data);
    } catch (e) { setError(e instanceof Error ? e.message : "OCR failed."); }
    finally { setBusy(""); }
  }
  const pdfs = resources.filter(r => r.versions.find(v => v.version === r.currentVersion)?.filename.toLowerCase().endsWith(".pdf"));
  if (!pdfs.length) return null;
  return <details className="reference-ocr"><summary>Local PDF text recognition (OCR)</summary><p>{capability?.message || "Checking local OCR availability…"}</p>{error && <p role="alert">{error}</p>}<label>OCR language<select aria-label="OCR language" value={language} disabled={!!busy || !capability?.available} onChange={e => setLanguage(e.target.value)}>{(capability?.languages.length ? capability.languages : ["eng"]).map(value => <option key={value}>{value}</option>)}</select></label>{pdfs.map(resource => {
    const version = resource.versions.find(v => v.version === resource.currentVersion)!;
    const pending = version.extractionStatus === "partial" && version.extractionMessage?.startsWith("Local OCR");
    return <section key={resource.id}><h4>{resource.title} · v{resource.currentVersion}</h4><button className="button button-outline" disabled={!!busy || !capability?.available} onClick={() => void run(resource)}>{busy === resource.id ? "Processing…" : "Create OCR version"}</button>{pending && <><p>Inspect recognition before permitting this version to ground suggestions. The original version is preserved.</p><details><summary>Inspect OCR passages</summary>{version.passages.map(p => <section key={p.locator}><strong>{p.locator}</strong><p style={{ whiteSpace: "pre-wrap" }}>{p.text}</p></section>)}</details><button className="button button-outline" disabled={!!busy} onClick={() => void run(resource, true)}>Use inspected OCR text</button></>}</section>;
  })}</details>;
}
