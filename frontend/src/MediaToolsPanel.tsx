import { useEffect, useState } from "react";
import type { Asset, Project, Scene } from "./App";
import { effectivePlacements, placementFor, scenePlacements } from "./media";
import type { MediaPlacement } from "./media";
import { storyboardWriteHeaders, revisionConflictMessage } from "./revision";
import "./media-tools.css";

type SharedRecord = { id: string; asset: Asset; createdAt: string };
type Capability = { canPublishShared: boolean; ocr: { available: boolean; languages: string[]; message: string } };

export function MediaToolsPanel({ project, scene, onProjectUpdated }: { project: Project; scene?: Scene; onProjectUpdated: (p: Project) => void }) {
  const [shared, setShared] = useState<SharedRecord[]>([]);
  const [capability, setCapability] = useState<Capability | null>(null);
  const [selected, setSelected] = useState("");
  const [scope, setScope] = useState<"scene" | "course">("scene");
  const [placement, setPlacement] = useState<MediaPlacement>(placementFor(""));
  const [transcript, setTranscript] = useState("");
  const [captions, setCaptions] = useState("");
  const [language, setLanguage] = useState("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const asset = project.storyboard.assets.find(a => a.id === selected) ?? project.storyboard.assets[0];
  const placements = scope === "course" ? project.storyboard.courseMedia ?? [] : scene ? scenePlacements(scene) : [];
  const placed = Boolean(asset && placements.some(p => p.assetId === asset.id));
  const uses = asset ? project.storyboard.scenes.filter(s => effectivePlacements(project, s).some(p => p.assetId === asset.id)) : [];

  async function refresh() {
    const [library, config] = await Promise.all([fetch(`/api/projects/${project.id}/shared-media`), fetch(`/api/projects/${project.id}/media-capabilities`)]);
    if (!library.ok || !config.ok) throw new Error("Media tools could not be loaded.");
    setShared(await library.json()); setCapability(await config.json());
  }
  useEffect(() => { let active = true; Promise.all([fetch(`/api/projects/${project.id}/shared-media`), fetch(`/api/projects/${project.id}/media-capabilities`)]).then(async ([library, config]) => {
    if (!library.ok || !config.ok) throw new Error("Media tools could not be loaded.");
    const values = await Promise.all([library.json(), config.json()]);
    if (active) { setShared(values[0]); setCapability(values[1]); }
  }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [project.id]);
  useEffect(() => {
    if (!asset) return;
    const current = (scope === "course" ? project.storyboard.courseMedia ?? [] : scene ? scenePlacements(scene) : []).find(p => p.assetId === asset.id);
    setPlacement(current ?? placementFor(asset.id));
    setTranscript(asset.transcript ?? ""); setCaptions(asset.captionsVtt ?? ""); setLanguage(asset.language ?? "en");
  }, [asset?.id, project.storyboard.revision, scope, scene?.id]);

  async function act(path: string, method: string, body?: unknown, update = true) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/projects/${project.id}/${path}`, { method, headers: storyboardWriteHeaders(project.storyboard.revision), body: body === undefined ? undefined : JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(revisionConflictMessage(response.status) || (typeof result.detail === "string" ? result.detail : "Media change could not be saved."));
      if (update) onProjectUpdated(result as Project);
      else await refresh();
      setNotice(update ? "Saved locally." : "Shared library updated. Existing project copies are unchanged.");
    } catch (e) { setError(e instanceof Error ? e.message : "Media action failed; your draft is retained."); }
    finally { setBusy(false); }
  }
  function savePlacement(remove = false) {
    if (!asset || scope === "scene" && !scene) return;
    const next = placements.filter(p => p.assetId !== asset.id);
    if (!remove) next.push({ ...placement, assetId: asset.id });
    void act(scope === "course" ? "course-media" : `scenes/${scene!.id}/media-placements`, "PUT", { placements: next, excludedAssetIds: scope === "scene" ? scene?.excludedCourseMedia ?? [] : [] });
  }

  return <section className="media-tools" aria-label="Media placement and shared library">
    <details><summary>Placement, captions, and shared media</summary>
      <p className="field-hint">Place project media on one scene or throughout the course. Shared media is copied into this project before use.</p>
      {error && <p role="alert" className="visual-editor-error">{error}</p>}{notice && <p role="status">{notice}</p>}
      <div className="media-tools-columns"><section><h3>Project media</h3>
        <label>Media<select value={asset?.id ?? ""} onChange={e => setSelected(e.target.value)} disabled={busy || !project.storyboard.assets.length}><option value="" disabled>Select media</option>{project.storyboard.assets.map(a => <option value={a.id} key={a.id}>{a.filename}</option>)}</select></label>
        {asset && <><p className="field-hint">{uses.length ? `Used in ${uses.map(s => s.title).join(", ")}` : "No placements yet."}{asset.sharedSourceId ? " · Pinned copy from shared library" : ""}</p>
          <div className="media-tools-row"><label>Placement scope<select value={scope} onChange={e => setScope(e.target.value as "scene" | "course")} disabled={busy}><option value="scene">Selected scene</option><option value="course">Entire course</option></select></label><label>Media order<input type="number" min={0} max={10000} value={placement.order} disabled={busy} onChange={e => setPlacement({ ...placement, order: Number(e.target.value) })} /></label></div>
          <label>Position<select value={placement.position} disabled={busy} onChange={e => setPlacement({ ...placement, position: e.target.value as "before" | "after" })}><option value="before">Before scene content</option><option value="after">After scene content</option></select></label>
          <label>Media role<select value={placement.role ?? "supporting"} disabled={busy} onChange={e => setPlacement({ ...placement, role: e.target.value as MediaPlacement["role"] })}><option value="supporting">Supporting content</option><option value="narration">Narration</option><option value="demonstration">Demonstration</option></select></label>
          {asset.kind === "image" ? <><label>Placement description<input maxLength={2000} disabled={busy || placement.decorative} value={placement.altText} onChange={e => setPlacement({ ...placement, altText: e.target.value })} /></label><label className="media-tools-check"><input type="checkbox" checked={placement.decorative} disabled={busy} onChange={e => setPlacement({ ...placement, decorative: e.target.checked, altText: e.target.checked ? "" : placement.altText })} />Decorative image</label></> : <><label className="media-tools-check"><input type="checkbox" checked={placement.loop} disabled={busy || asset.kind === "audio" && !!scene?.audioRequired} onChange={e => setPlacement({ ...placement, loop: e.target.checked })} />Loop playback</label><label className="media-tools-check"><input type="checkbox" checked={placement.muted} disabled={busy} onChange={e => setPlacement({ ...placement, muted: e.target.checked })} />Start muted</label></>}
          <div className="media-tools-actions"><button className="button button-accent" onClick={() => savePlacement()} disabled={busy || scope === "scene" && !scene}>Save placement</button><button className="button button-outline" onClick={() => savePlacement(true)} disabled={busy || !placed}>Remove placement</button></div>
          {scene && (project.storyboard.courseMedia ?? []).some(p => p.assetId === asset.id) && <label className="media-tools-check"><input type="checkbox" checked={(scene.excludedCourseMedia ?? []).includes(asset.id)} disabled={busy} onChange={e => void act(`scenes/${scene.id}/media-placements`, "PUT", { placements: scenePlacements(scene), excludedAssetIds: e.target.checked ? [...new Set([...(scene.excludedCourseMedia ?? []), asset.id])] : (scene.excludedCourseMedia ?? []).filter(id => id !== asset.id) })} />Exclude course-wide media from this scene (a scene placement overrides this)</label>}
          {asset.kind !== "image" && <details><summary>Transcript and timed captions</summary><label>Transcript<textarea rows={4} maxLength={100000} value={transcript} onChange={e => setTranscript(e.target.value)} disabled={busy} /></label><label>WebVTT captions<textarea rows={5} maxLength={200000} value={captions} onChange={e => setCaptions(e.target.value)} disabled={busy} placeholder={"WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nCaption text"} /></label><label>Caption language<input value={language} maxLength={40} disabled={busy} onChange={e => setLanguage(e.target.value)} /></label><button className="button button-outline" disabled={busy} onClick={() => void act(`assets/${asset.id}/metadata`, "PATCH", { transcript, captionsVtt: captions, language })}>Save transcript and captions</button></details>}
          <div className="media-tools-actions">{capability?.canPublishShared && <button className="button button-outline" disabled={busy} onClick={() => void act(`assets/${asset.id}/share`, "POST", undefined, false)}>Publish copy to shared library</button>}<button className="button button-outline" disabled={busy || uses.length > 0 || (project.storyboard.courseMedia ?? []).some(p => p.assetId === asset.id)} onClick={() => void act(`assets/${asset.id}`, "DELETE")}>Remove unused media</button></div>
        </>}
      </section><section><h3>Shared library</h3><p className="field-hint">Copying preserves media and credits in this project. New library versions and withdrawals leave copies unchanged.</p>{!shared.length && <p>No shared media yet.</p>}{shared.map(record => <article className="shared-media-row" key={record.id}><strong>{record.asset.filename}</strong><small>{record.asset.kind} · {(record.asset.sizeBytes / 1024 / 1024).toFixed(2)} MB</small><button className="button button-outline" disabled={busy} onClick={() => void act(`shared-media/${record.id}/copy`, "POST")}>Copy to project</button>{capability?.canPublishShared && <button className="button button-outline" disabled={busy} onClick={() => void act(`shared-media/${record.id}`, "DELETE", undefined, false)}>Withdraw from library</button>}</article>)}</section></div>
    </details>
  </section>;
}
