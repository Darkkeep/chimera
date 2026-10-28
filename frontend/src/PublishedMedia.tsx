import { useEffect, useRef } from "react";
import type { Project, Scene } from "./App";
import { effectivePlacements } from "./media";
import { videoCoveragePercent, type VideoProgress } from "./completion";
import { installCaptionTrack } from "../../backend/app/static/captions.js";

function mergePlayedRanges(progress: VideoProgress | undefined, video: HTMLVideoElement): [number, number][] {
  const ranges = (progress?.watchedRanges ?? [])
    .map(([start, end]) => [Math.max(0, start), Math.min(video.duration, end)] as [number, number])
    .filter(([start, end]) => end > start);
  for (let index = 0; index < video.played.length; index += 1) {
    const start = Math.max(0, video.played.start(index));
    const end = Math.min(video.duration, video.played.end(index));
    if (end > start) ranges.push([start, end]);
  }
  ranges.sort((left, right) => left[0] - right[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && start <= previous[1] + 0.2) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return merged.map(([start, end]) => [Math.round(start * 10) / 10, Math.round(end * 10) / 10]);
}

function TrackedVideo({ source, label, loop, muted, captions, language, progress, threshold, onProgress }: {
  source: string;
  label: string;
  loop: boolean;
  muted: boolean;
  captions: string;
  language: string;
  progress?: VideoProgress;
  threshold: number;
  onProgress: (progress: VideoProgress) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const progressRef = useRef(progress);
  const onProgressRef = useRef(onProgress);
  progressRef.current = progress;
  onProgressRef.current = onProgress;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    installCaptionTrack(video, captions, language);
    if (threshold <= 0) return;

    let lastUpdate = 0;
    const capture = (force = false) => {
      const now = Date.now();
      if (!force && now - lastUpdate < 1000) return;
      if (!Number.isFinite(video.duration) || video.duration <= 0) return;
      const value: VideoProgress = {
        position: Math.max(0, Math.min(video.currentTime, video.duration)),
        duration: video.duration,
        watchedRanges: mergePlayedRanges(progressRef.current, video),
      };
      progressRef.current = value;
      lastUpdate = now;
      onProgressRef.current(value);
    };
    const savedPosition = progressRef.current?.position;
    let positionRestored = !(savedPosition && savedPosition > 0);
    let restoreScheduled = false;
    let restorePending = false;
    let restoreAttempts = 0;
    let restoreFrame: number | undefined;
    let retryTimer: number | undefined;
    const restorePosition = () => {
      if (positionRestored || restoreScheduled || restorePending || restoreAttempts >= 3
        || !savedPosition || savedPosition >= video.duration
        || video.readyState < 2 || video.seekable.length === 0) return;
      restoreScheduled = true;
      restoreFrame = window.requestAnimationFrame(() => {
        restoreFrame = undefined;
        restoreScheduled = false;
        if (positionRestored || restorePending || video.readyState < 2 || video.seekable.length === 0) return;
        restoreAttempts += 1;
        restorePending = true;
        video.currentTime = savedPosition;
      });
    };
    const onTimeUpdate = () => capture();
    const onPause = () => capture(true);
    const onSeeked = () => {
      if (restorePending) {
        restorePending = false;
        if (Math.abs(video.currentTime - (savedPosition ?? 0)) < 0.1) {
          positionRestored = true;
          capture(true);
        } else if (restoreAttempts < 3) {
          retryTimer = window.setTimeout(restorePosition, 50);
        } else {
          capture(true);
        }
        return;
      }
      capture(true);
    };
    const onEnded = () => capture(true);
    video.addEventListener("loadedmetadata", restorePosition);
    video.addEventListener("loadeddata", restorePosition);
    video.addEventListener("canplay", restorePosition);
    video.addEventListener("progress", restorePosition);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("pause", onPause);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("ended", onEnded);
    if (video.readyState >= 2) restorePosition();
    return () => {
      video.removeEventListener("loadedmetadata", restorePosition);
      video.removeEventListener("loadeddata", restorePosition);
      video.removeEventListener("canplay", restorePosition);
      video.removeEventListener("progress", restorePosition);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("ended", onEnded);
      if (restoreFrame !== undefined) window.cancelAnimationFrame(restoreFrame);
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [captions, language, source, threshold]);

  return <video ref={videoRef} controls playsInline preload="metadata" src={source} aria-label={label} loop={loop} muted={muted} />;
}

export function PublishedMedia({ project, scene, position, completedAudioKeys, onAudioEnded, videoProgress = {}, onVideoProgress }: {
  project: Project;
  scene: Scene;
  position: "before" | "after";
  completedAudioKeys: string[];
  onAudioEnded: (key: string) => void;
  videoProgress?: Record<string, VideoProgress>;
  onVideoProgress?: (key: string, progress: VideoProgress) => void;
}) {
  const embedded = new Set(scene.visualLayout?.enabled ? scene.visualLayout.elements.filter(e => e.kind === "image").map(e => e.assetId) : []);
  return <div className="published-media">{effectivePlacements(project, scene).filter(p => p.position === position && !embedded.has(p.assetId)).map(placement => {
    const asset = project.storyboard.assets.find(a => a.id === placement.assetId);
    if (!asset) return null;
    const source = `/api/projects/${project.id}/assets/${asset.id}`;
    const required = asset.kind === "audio" && scene.audioRequired;
    const key = asset.kind === "video" ? asset.id : `${scene.id}:${asset.id}`;
    const trackedVideo = asset.kind === "video" && placement.requiredViewing;
    const progress = trackedVideo ? videoProgress[key] : undefined;
    const threshold = placement.viewingThresholdPercent ?? 90;
    const coverage = videoCoveragePercent(progress);
    return <section key={asset.id} className={asset.kind === "image" ? "course-preview-images" : `course-preview-audio ${required ? "required-audio" : ""}`}>
      {asset.kind === "image" ? <img className="course-preview-image" src={source} alt={placement.decorative ? "" : placement.altText || asset.filename} /> : <>
        <span>{asset.filename}{required ? ` · ${completedAudioKeys.includes(key) ? "Complete" : "Required"}` : ""}</span>
        {asset.kind === "video" ? <>
          <TrackedVideo
            source={source}
            label={`Video: ${asset.filename}${trackedVideo ? ", required viewing" : ""}`}
            loop={placement.loop}
            muted={placement.muted}
            captions={asset.captionsVtt || ""}
            language={asset.language || "en"}
            progress={progress}
            threshold={trackedVideo ? threshold : 0}
            onProgress={next => onVideoProgress?.(key, next)}
          />
          {trackedVideo && <span role="status">{coverage >= threshold ? "Viewing complete" : `${coverage}% viewed · ${threshold}% required`}</span>}
        </> : <><audio ref={node => { if (node) installCaptionTrack(node, asset.captionsVtt || "", asset.language || "en"); }} controls preload="metadata" src={source} aria-label={`Audio: ${asset.filename}${required ? ", required" : ""}`} loop={placement.loop} muted={placement.muted} onEnded={() => { if (required) onAudioEnded(key); }} /></>}
        {asset.transcript && <details><summary>Transcript: {asset.filename}</summary><p>{asset.transcript}</p></details>}
      </>}
    </section>;
  })}</div>;
}
