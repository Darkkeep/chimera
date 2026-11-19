import { Captions, Maximize, Minimize, Pause, Play, RotateCcw, Rewind, FastForward, Square, Volume2, VolumeX } from "lucide-react";
import "./scene-player.css";
import { clipProgressKey } from "../../backend/app/static/timeline-policy.js";
import { useEffect, useRef, useState } from "react";
import type { Project, Scene } from "./App";
import { createSceneTransport } from "../../backend/app/static/scene-transport.js";
import type {
  SceneTransport,
  ClipProgress,
} from "../../backend/app/static/scene-transport.js";
import { playStageAnimations } from "../../backend/app/static/stage-animations.js";
import { installCaptionTrack } from "../../backend/app/static/captions.js";

export function playerTime(milliseconds: number) {
  const seconds=Math.max(0,Math.floor(milliseconds/1000)),minutes=Math.floor(seconds/60),hours=Math.floor(minutes/60);
  return hours ? `${hours}:${String(minutes%60).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}` : `${String(minutes).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
}
export function TimelinePlayback({
  root,
  project,
  scene,
  onProgress,
  progress = {},
  controlledTime,
  onTime,
  playing,
  onPlaying,
  audition,
  animateStage = false,
}: {
  root: React.RefObject<HTMLDivElement | null>;
  project: Project;
  scene: Scene;
  onProgress?: (id: string, value: ClipProgress) => void;
  progress?: Record<string, ClipProgress>;
  controlledTime?: number;
  onTime?: (n: number) => void;
  playing?: boolean;
  onPlaying?: (b: boolean) => void;
  audition?: { muted: string[]; solo: string | null };
  animateStage?: boolean;
}) {
  const lastSaved = useRef(0);
  const [muted,setMuted] = useState(false),[fullscreen,setFullscreen] = useState(false),[canFullscreen,setCanFullscreen] = useState(false);
  const muteRef=useRef(muted);muteRef.current=muted;
  const [captions,setCaptions] = useState(true);
  const captionsRef=useRef(captions);captionsRef.current=captions;
  useEffect(()=>{for(const {node} of transport.current?.media || [])for(const track of Array.from(node.textTracks))if(track.kind==="captions")track.mode=captions?"showing":"disabled";},[captions]);
  useEffect(()=>{setCanFullscreen(Boolean(document.fullscreenEnabled));const changed=()=>setFullscreen(document.fullscreenElement===root.current);document.addEventListener("fullscreenchange",changed);return()=>document.removeEventListener("fullscreenchange",changed);},[root]);
  useEffect(()=>{for(const {node} of transport.current?.media || [])node.muted=muted;},[muted]);
  const transport = useRef<SceneTransport | null>(null);
  const [time, setTime] = useState(0),
    [active, setActive] = useState(false),
    [error, setError] = useState("");
  const callbacks = useRef({ onProgress, onTime, onPlaying });
  callbacks.current = { onProgress, onTime, onPlaying };
  const signature = JSON.stringify(scene.visualLayout);
  useEffect(() => {
    const layout = scene.visualLayout,
      host = root.current,
      stage = host?.querySelector<HTMLElement>(".visual-stage");
    if (!layout?.timeline || !host || !stage) return;
    const initial =
      controlledTime ?? (progress[`clock:${scene.id}`]?.position || 0) * 1000;
    // Define animations before the transport captures them; the one scene clock
    // then owns pause, seek and replay instead of starting a second motion clock.
    const cancelAnimations=playStageAnimations(host,layout.elements);
    const controller = createSceneTransport({
      root: host,
      stage,
      layout,
      initialTimeMs: initial,
      resolveAsset: (id) => {
        const a = project.storyboard.assets.find((a) => a.id === id);
        return a
          ? { ...a, path: `/api/projects/${project.id}/assets/${id}` }
          : null;
      },
      progress: Object.fromEntries(
        layout.timeline.clips
          .map((c) => [c.id, progress[clipProgressKey(scene.id, c)]])
          .filter(([, v]) => v),
      ),
      onUpdate: (n, b) => {
        if (!b || n - (lastSaved.current || 0) > 5000) {
          lastSaved.current = n;
          callbacks.current.onProgress?.(`clock:${scene.id}`, {
            position: n / 1000,
            duration: layout.timeline!.durationMs / 1000,
            watchedRanges: [],
          });
        }
        setTime(n);
        setActive(b);
        callbacks.current.onTime?.(n);
        callbacks.current.onPlaying?.(b);
      },
      onProgress: (id, value) => {
        const clip = layout.timeline!.clips.find((c) => c.id === id);
        if (clip)
          callbacks.current.onProgress?.(
            clipProgressKey(scene.id, clip),
            value,
          );
      },
      onError: setError,
      onInteraction: () => callbacks.current.onPlaying?.(false),
    });
    for (const { node, asset } of controller.media)
      if (asset)
        installCaptionTrack(
          node,
          asset.captionsVtt || "",
          asset.language || "en",
        );
    for(const {node} of controller.media){node.muted=muteRef.current;for(const track of Array.from(node.textTracks))if(track.kind==="captions")track.mode=captionsRef.current?"showing":"disabled";}
    transport.current = controller;
    // Explicit author-side Replay animations uses this same clock. Learner
    // previews request playback only through the player controls.
    if(animateStage && controlledTime===undefined)controller.play();
    return () => {
      callbacks.current.onProgress?.(`clock:${scene.id}`, {
        position: controller.currentTime / 1000,
        duration: layout.timeline!.durationMs / 1000,
        watchedRanges: [],
      });
      controller.dispose();
      cancelAnimations();
      transport.current = null;
    };
    // Rebuild only when saved composition changes; progress is read when mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, signature, project.id]);
  useEffect(() => {
    if (
      controlledTime !== undefined &&
      transport.current &&
      Math.abs(transport.current.currentTime - controlledTime) > 40
    )
      transport.current.seek(controlledTime);
  }, [controlledTime]);
  useEffect(() => {
    if (playing === undefined) return;
    if (playing) transport.current?.play();
    else transport.current?.pause();
  }, [playing]);
  useEffect(() => {
    transport.current?.setAudition(audition || { muted: [], solo: null });
  }, [audition, signature]);
  if (!scene.visualLayout?.timeline) return null;
  const duration=scene.visualLayout.timeline.durationMs;
  function togglePlayback() {setError("");if(transport.current?.playing)transport.current.pause();else transport.current?.play();}
  function seek(delta: number) {transport.current?.seek(Math.max(0,Math.min(duration,(transport.current?.currentTime||0)+delta)));}
  async function toggleFullscreen() {try{if(document.fullscreenElement===root.current)await document.exitFullscreen();else await root.current?.requestFullscreen();}catch{setError("Fullscreen is unavailable in this browser window.");}}
  return (
    <section className={`scene-transport ${controlledTime === undefined ? "scene-player-bar" : "scene-player-controlled"}`} aria-label="Scene playback">
      {controlledTime === undefined && <>
        <div className="scene-player-timeline">
          <output aria-label="Elapsed time" aria-live="off">{playerTime(time)}</output>
          <input className="scene-player-scrubber" aria-label="Scene playback time" aria-valuetext={`${playerTime(time)} of ${playerTime(duration)}`} type="range" min={0} max={duration} step={50} value={time}
            style={{"--played":`${Math.min(100,time/duration*100)}%`} as React.CSSProperties}
            onChange={event=>transport.current?.seek(Number(event.target.value))}
            onKeyDown={event=>{
              if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();seek((event.key==="ArrowLeft"?-1:1)*(event.shiftKey?1000:5000));}
              if(event.key==="Home"||event.key==="End"){event.preventDefault();transport.current?.seek(event.key==="Home"?0:duration);}
            }}/>
          <output aria-label="Scene duration" aria-live="off">{playerTime(duration)}</output>
        </div>
        <div className="scene-player-controls" role="group" aria-label="Playback controls">
          <div className="scene-player-primary">
            <button type="button" className="scene-player-button" aria-label="Back 5 seconds" title="Back 5 seconds" onClick={()=>seek(-5000)}><Rewind size={17}/></button>
            <button type="button" className="scene-player-button scene-player-play" aria-label={active?"Pause scene":"Play scene"} title={active?"Pause":"Play"} onClick={togglePlayback}><span aria-hidden="true">{active?<Pause size={19}/>:<Play size={19}/>}</span></button>
            <button type="button" className="scene-player-button" aria-label="Forward 5 seconds" title="Forward 5 seconds" onClick={()=>seek(5000)}><FastForward size={17}/></button>
            <span className="scene-player-divider"/>
            <button type="button" className="scene-player-button" aria-label="Stop scene" title="Stop and return to start" onClick={()=>{transport.current?.pause();transport.current?.seek(0);}}><Square size={15}/></button>
            <button type="button" className="scene-player-button" aria-label="Restart" title="Replay from start" onClick={()=>{setError("");transport.current?.seek(0);transport.current?.play();}}><RotateCcw size={16}/></button>
          </div>
          <div className="scene-player-secondary">
            {scene.visualLayout.timeline.clips.length>0 && <button type="button" className="scene-player-button" aria-label={muted?"Unmute scene":"Mute scene"} aria-pressed={muted} title={muted?"Unmute":"Mute"} onClick={()=>setMuted(!muted)}>{muted?<VolumeX size={17}/>:<Volume2 size={17}/>}</button>}
            {scene.visualLayout.timeline.clips.some(clip=>project.storyboard.assets.some(asset=>asset.id===clip.assetId&&asset.captionsVtt)) && <button type="button" className="scene-player-button" aria-label="Captions" aria-pressed={captions} title={captions?"Hide captions":"Show captions"} onClick={()=>setCaptions(!captions)}><Captions size={17}/></button>}
            {canFullscreen && <button type="button" className="scene-player-button" aria-label={fullscreen?"Exit fullscreen":"Enter fullscreen"} aria-pressed={fullscreen} title={fullscreen?"Exit fullscreen":"Fullscreen"} onClick={()=>void toggleFullscreen()}>{fullscreen?<Minimize size={17}/>:<Maximize size={17}/>}</button>}
          </div>
        </div>
      </>}
      {error && <p role="status">{error}</p>}
    </section>
  );
}
