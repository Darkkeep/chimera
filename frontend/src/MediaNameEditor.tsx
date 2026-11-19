import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import type { Asset, Project } from "./App";
import { assetLabel } from "./asset-display";
import { revisionConflictMessage, storyboardWriteHeaders } from "./revision";

export function MediaNameEditor({ asset, projectId, revision, canRename, onProjectUpdated }: { asset: Asset; projectId: string; revision: number; canRename: boolean; onProjectUpdated: (project: Project) => void }) {
  const [editing,setEditing] = useState(false),[name,setName] = useState(asset.displayName || ""),[busy,setBusy] = useState(false),[error,setError] = useState("");
  const openingRevision=useRef(revision),trigger=useRef<HTMLButtonElement>(null),input=useRef<HTMLInputElement>(null);
  useEffect(()=>{if(!editing)setName(asset.displayName || "");},[asset.displayName,editing]);
  useEffect(()=>{if(editing)input.current?.focus();},[editing]);
  function cancel(){if(busy)return;setEditing(false);setError("");setName(asset.displayName || "");requestAnimationFrame(()=>trigger.current?.focus());}
  async function save(){
    if(busy || !canRename)return;
    setBusy(true);setError("");
    try{
      const response=await fetch(`/api/projects/${projectId}/assets/${asset.id}/metadata`,{method:"PATCH",headers:storyboardWriteHeaders(openingRevision.current),body:JSON.stringify({displayName:name.trim()})});
      if(!response.ok){const payload=await response.json().catch(()=>null);throw new Error(revisionConflictMessage(response.status) || (typeof payload?.detail==="string"?payload.detail:"Media name could not be saved. Your draft is preserved."));}
      onProjectUpdated(await response.json() as Project);setEditing(false);requestAnimationFrame(()=>trigger.current?.focus());
    }catch(issue){setError(issue instanceof Error?issue.message:"Media name could not be saved. Your draft is preserved.");}
    finally{setBusy(false);}
  }
  return <div className="media-name-editor">
    {!editing ? canRename && <button ref={trigger} type="button" className="media-rename-button" aria-label={`Rename ${assetLabel(asset)}`} onClick={()=>{openingRevision.current=revision;setName(asset.displayName || "");setError("");setEditing(true);}}><Pencil size={13}/>Rename</button> : <div className="media-name-form" onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();cancel();}}}>
      <label>Library name<input ref={input} aria-label="Media display name" type="text" value={name} maxLength={200} placeholder={asset.filename} disabled={busy || !canRename} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();void save();}}}/></label>
      <small>Leave blank to use the original filename.</small>
      <div className="media-name-actions"><button type="button" className="button button-outline" disabled={busy || !canRename || name.trim()===(asset.displayName || "")} onClick={()=>void save()}>{busy?"Saving…":"Save name"}</button><button type="button" className="button button-outline" disabled={busy} onClick={cancel}>Cancel</button></div>
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>;
}
