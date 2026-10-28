// One clock for media, visibility, and native animations in all delivery surfaces.
export function createSceneTransport({
  root,
  stage,
  layout,
  resolveAsset,
  onUpdate = () => {},
  onProgress = () => {},
  onError = () => {},
  progress = {},
  initialTimeMs = 0,
}) {
  const timeline = layout.timeline;
  if (!timeline) throw new Error("A scene timeline is required");
  let time = Math.max(0, Math.min(initialTimeMs, timeline.durationMs));
  let playing = false,
    disposed = false,
    frame = 0,
    last = 0,
    generation = 0;
  let settleTimer = 0,
    reportedTime = -1,
    reportedPlaying = null;
  let audition = { muted: [], solo: null };
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const animations = [];
  // Capture the native animation definitions, then keep every animation paused.
  for (const node of root.querySelectorAll("[data-scene-element]")) {
    node.getAnimations?.().forEach((animation) => {
      animation.pause();
      animations.push(animation);
    });
  }
  const nodes = new Map(
    [...root.querySelectorAll("[data-scene-element]")].map((node) => [
      node.dataset.sceneElement,
      node,
    ]),
  );
  const entryCaptions = [];
  const media = timeline.clips.map((clip) => {
    const asset = resolveAsset(clip.assetId);
    const node = document.createElement(clip.kind);
    node.preload = "auto";
    node.controls = false;
    node.setAttribute("aria-label", clip.name || asset?.filename || clip.kind);
    if (clip.kind === "video") {
      node.playsInline = true;
      node.style.cssText = `position:absolute;left:${clip.x}px;top:${clip.y}px;width:${clip.width}px;height:${clip.height}px;z-index:${clip.layerOrder ?? 4001};object-fit:contain`;
      stage.appendChild(node);
    } else {
      node.hidden = true;
      root.appendChild(node);
      const captions = document.createElement("p");
      captions.setAttribute("aria-live", "polite");
      captions.className = "scene-audio-captions";
      root.appendChild(captions);
      entryCaptions.push(captions);
      node.textTracks.addEventListener("addtrack", (event) => {
        const track = event.track;
        const update = () => {
          captions.textContent = [...(track.activeCues || [])]
            .map((cue) => cue.text)
            .join("\n");
        };
        track.addEventListener("cuechange", update);
        update();
      });
    }
    if (asset) node.src = asset.path;
    else onError(`Missing media: ${clip.name || clip.assetId}`);
    const ranges = (progress[clip.id]?.watchedRanges || []).map((range) => [
      ...range,
    ]);
    const entry = { clip, node, asset, ranges, previous: null, pending: false };
    const reset = () => {
      entry.previous = null;
    };
    node.addEventListener("seeking", reset);
    node.addEventListener("waiting", () => {
      reset();
      if (playing) {
        pause();
        onError("Media is buffering. Press Play when it is ready.");
      }
    });
    node.addEventListener("error", () => {
      pause();
      onError(`Media could not be loaded: ${clip.name || clip.assetId}`);
    });
    node.addEventListener("loadedmetadata", () => {
      if (clip.sourceOutMs > node.duration * 1000 + 100)
        onError(`Trim exceeds source duration: ${clip.name || clip.assetId}`);
      sync(false);
    });
    node.addEventListener("loadeddata", () => settle());
    node.addEventListener("canplay", () => settle());
    // Native played ranges credit actual playback and retain holes introduced by seeking.
    const record = () => {
      const current = node.currentTime;
      for (let i = 0; i < node.played.length; i++) {
        const start =
          Math.max(clip.sourceInMs / 1000, node.played.start(i)) -
          clip.sourceInMs / 1000;
        const end =
          Math.min(clip.sourceOutMs / 1000, node.played.end(i)) -
          clip.sourceInMs / 1000;
        if (end > start) ranges.push([start, end]);
      }
      ranges.sort((a, b) => a[0] - b[0]);
      const merged = [];
      for (const range of ranges) {
        const previous = merged[merged.length - 1];
        if (previous && range[0] <= previous[1] + 0.001)
          previous[1] = Math.max(previous[1], range[1]);
        else merged.push([...range]);
      }
      ranges.splice(0, ranges.length, ...merged);
      if (merged.length)
        onProgress(clip.id, {
          position: Math.max(0, current - clip.sourceInMs / 1000),
          duration: (clip.sourceOutMs - clip.sourceInMs) / 1000,
          watchedRanges: merged,
        });
    };
    node.addEventListener("timeupdate", record);
    node.addEventListener("pause", record);
    node.addEventListener("ended", record);
    return entry;
  });
  function sync(startMedia) {
    if (disposed) return;
    for (const element of layout.elements) {
      const node = nodes.get(element.id);
      if (node)
        node.style.visibility =
          element.hidden ||
          (element.timing &&
            (time < element.timing.startMs || time >= element.timing.endMs))
            ? "hidden"
            : "";
    }
    for (const animation of animations)
      animation.currentTime = reduced?.matches ? null : time;
    for (const entry of media) {
      const { clip, node } = entry;
      const duration = clip.sourceOutMs - clip.sourceInMs;
      const elapsed = time - clip.startMs;
      const active = elapsed >= 0 && elapsed < duration;
      if (clip.kind === "video")
        node.style.visibility = active ? "visible" : "hidden";
      const wanted =
        (clip.sourceInMs + Math.max(0, Math.min(elapsed, duration))) / 1000;
      if (
        node.readyState >= 1 &&
        Math.abs(node.currentTime - wanted) > (playing ? 0.25 : 0.015)
      ) {
        entry.previous = null;
        node.currentTime = wanted;
      }
      const fade = Math.min(
        1,
        clip.fadeInMs ? Math.max(0, elapsed) / clip.fadeInMs : 1,
        clip.fadeOutMs ? Math.max(0, duration - elapsed) / clip.fadeOutMs : 1,
      );
      node.volume =
        audition.muted.includes(clip.id) ||
        (audition.solo && audition.solo !== clip.id)
          ? 0
          : clip.volume * fade;
      if (!active || !playing) {
        node.pause();
        entry.previous = null;
      } else if ((startMedia || node.paused) && !entry.pending && entry.asset) {
        entry.pending = true;
        const currentGeneration = generation;
        Promise.resolve(node.play())
          .catch(() => {
            if (!disposed && currentGeneration === generation) {
              pause();
              onError(
                "Playback could not start. Select Play to retry and check your browser media permissions.",
              );
            }
          })
          .finally(() => {
            entry.pending = false;
            if (disposed || !playing) node.pause();
          });
      }
    }
    if (reportedTime !== time || reportedPlaying !== playing) {
      reportedTime = time;
      reportedPlaying = playing;
      onUpdate(time, playing);
    }
  }
  function settle(attempt = 0) {
    clearTimeout(settleTimer);
    if (disposed || playing) return;
    sync(false);
    const pending = media.some(({ node, clip }) => {
      const wanted =
        (clip.sourceInMs +
          Math.max(
            0,
            Math.min(time - clip.startMs, clip.sourceOutMs - clip.sourceInMs),
          )) /
        1000;
      return (
        node.readyState < 2 ||
        node.seeking ||
        Math.abs(node.currentTime - wanted) > 0.05
      );
    });
    if (attempt < 40 && (attempt < 4 || pending))
      settleTimer = setTimeout(() => settle(attempt + 1), 50);
  }
  function tick(now) {
    if (!playing || disposed) return;
    time = Math.min(timeline.durationMs, time + Math.max(0, now - last));
    last = now;
    if (time >= timeline.durationMs) playing = false;
    sync(false);
    if (playing) frame = requestAnimationFrame(tick);
  }
  function play() {
    if (disposed || playing) return;
    if (time >= timeline.durationMs) time = 0;
    generation++;
    playing = true;
    last = performance.now();
    sync(true);
    if (playing) frame = requestAnimationFrame(tick);
  }
  function pause() {
    generation++;
    playing = false;
    cancelAnimationFrame(frame);
    sync(false);
  }
  function seek(value) {
    time = Math.max(0, Math.min(value, timeline.durationMs));
    media.forEach((entry) => {
      entry.previous = null;
    });
    last = performance.now();
    sync(false);
    settle();
  }
  function visibility() {
    if (document.hidden) pause();
  }
  function preference() {
    sync(false);
  }
  document.addEventListener("visibilitychange", visibility);
  reduced?.addEventListener("change", preference);
  sync(false);
  settle();
  return {
    play,
    pause,
    seek,
    setAudition(value) {
      audition = value;
      sync(false);
    },
    get currentTime() {
      return time;
    },
    get playing() {
      return playing;
    },
    media: media.map(({ node, clip, asset }) => ({ node, clip, asset })),
    dispose() {
      pause();
      disposed = true;
      clearTimeout(settleTimer);
      document.removeEventListener("visibilitychange", visibility);
      reduced?.removeEventListener("change", preference);
      entryCaptions.forEach((node) => node.remove());
      media.forEach(({ node }) => {
        node.pause();
        node.removeAttribute("src");
        node.load();
        node.remove();
      });
    },
  };
}
