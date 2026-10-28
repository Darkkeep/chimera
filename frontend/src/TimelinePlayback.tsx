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
}) {
  const lastSaved = useRef(0);
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
    const cancel = playStageAnimations(host, layout.elements);
    const initial =
      controlledTime ?? (progress[`clock:${scene.id}`]?.position || 0) * 1000;
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
    });
    for (const { node, asset } of controller.media)
      if (asset)
        installCaptionTrack(
          node,
          asset.captionsVtt || "",
          asset.language || "en",
        );
    transport.current = controller;
    return () => {
      callbacks.current.onProgress?.(`clock:${scene.id}`, {
        position: controller.currentTime / 1000,
        duration: layout.timeline!.durationMs / 1000,
        watchedRanges: [],
      });
      controller.dispose();
      cancel();
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
  return (
    <section className="scene-transport" aria-label="Scene playback">
      {controlledTime === undefined && (
        <>
          <button
            type="button"
            className="button button-outline"
            onClick={() => {
              setError("");
              if (active) transport.current?.pause();
              else transport.current?.play();
            }}
          >
            {active ? "Pause scene" : "Play scene"}
          </button>
          <button
            type="button"
            className="button button-outline"
            onClick={() => transport.current?.seek(0)}
          >
            Restart
          </button>
          <label>
            Scene time
            <input
              aria-label="Scene playback time"
              type="range"
              min={0}
              max={scene.visualLayout.timeline.durationMs}
              step={50}
              value={time}
              onChange={(e) => transport.current?.seek(Number(e.target.value))}
            />
          </label>
          <output>
            {(time / 1000).toFixed(1)} /{" "}
            {(scene.visualLayout.timeline.durationMs / 1000).toFixed(1)} s
          </output>
        </>
      )}
      {error && <p role="status">{error}</p>}
    </section>
  );
}
