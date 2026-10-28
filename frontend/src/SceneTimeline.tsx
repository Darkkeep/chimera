import { useState } from "react";
import type { PointerEvent } from "react";
import type { Project } from "./App";
import type { SceneLayout, SceneElement } from "./SceneSurface";
import { animationEndMs } from "./scene-timeline";
import type { TimelineClip } from "./scene-timeline";
import { defaultAnimations, alignExitTiming } from "./AnimationControls";
import "./scene-timeline.css";
import { decodeWaveform } from "./waveform";
import type { Waveform } from "./waveform";

function Seconds({
  label,
  value,
  onChange,
  min = 0,
  max = 3600000,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label>
      {label} (s)
      <input
        aria-label={`${label} (s)`}
        type="number"
        min={min / 1000}
        max={max / 1000}
        step={0.05}
        value={Math.round(value) / 1000}
        onChange={(event) => {
          const n = Math.round(event.target.valueAsNumber * 1000);
          if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
      />
    </label>
  );
}

export function SceneTimeline({
  layout,
  project,
  commit,
  selection,
  select,
  time,
  setTime,
  playing,
  setPlaying,
  preview,
  setPreview,
  disabled,
  audition,
  onAudition,
}: {
  layout: SceneLayout;
  project: Project;
  commit: (layout: SceneLayout) => void;
  selection: string | null;
  select: (id: string | null) => void;
  time: number;
  setTime: (n: number) => void;
  playing: boolean;
  setPlaying: (b: boolean) => void;
  preview: boolean;
  setPreview: (b: boolean) => void;
  disabled: boolean;
  audition: { muted: string[]; solo: string | null };
  onAudition: (a: { muted: string[]; solo: string | null }) => void;
}) {
  const [zoom, setZoom] = useState(1),
    [snap, setSnap] = useState(true),
    [assetId, setAssetId] = useState(""),
    [clipId, setClipId] = useState<string | null>(null),
    [message, setMessage] = useState("");
  const [waveforms, setWaveforms] = useState<Record<string, Waveform>>({}),
    [decoding, setDecoding] = useState(false);
  const timeline = layout.timeline;
  const media = project.storyboard.assets.filter(
    (a) => a.kind === "audio" || a.kind === "video",
  );
  const clip = timeline?.clips.find((c) => c.id === clipId);
  const selected = layout.elements.find((e) => e.id === selection);
  function save(next: NonNullable<SceneLayout["timeline"]>) {
    const endpoint = Math.max(
      100,
      ...next.clips.map((c) => c.startMs + c.sourceOutMs - c.sourceInMs),
      ...layout.elements.map((e) =>
        Math.max(e.timing?.endMs || 0, animationEndMs(e.animations)),
      ),
      ...next.cues.map((c) => c.timeMs),
      next.printTimeMs,
    );
    if (next.durationMs < endpoint) {
      setMessage(
        "Scene duration must contain all objects, clips, cues, and the print timestamp.",
      );
      return;
    }
    setMessage("");
    commit({ ...layout, timeline: next });
  }
  function updateClip(patch: Partial<TimelineClip>) {
    if (!clip || !timeline) return;
    const next = { ...clip, ...patch };
    if (next.sourceDurationMs && next.sourceOutMs > next.sourceDurationMs) {
      setMessage("Source out must fit within the media duration.");
      return;
    }
    if (
      next.sourceOutMs <= next.sourceInMs ||
      next.fadeInMs + next.fadeOutMs > next.sourceOutMs - next.sourceInMs
    ) {
      setMessage(
        "Keep source out after source in and fit fades inside the clip.",
      );
      return;
    }
    const duration = Math.max(
      timeline.durationMs,
      next.startMs + next.sourceOutMs - next.sourceInMs,
    );
    save({
      ...timeline,
      durationMs: duration,
      clips: timeline.clips.map((c) => (c.id === clip.id ? next : c)),
    });
  }
  function changeElement(element: SceneElement, patch: Partial<SceneElement>) {
    const elements = layout.elements.map((e) =>
      e.id === element.id ? { ...e, ...patch } : e,
    );
    const endpoint = Math.max(
      timeline?.durationMs || 0,
      ...elements.map((e) =>
        Math.max(e.timing?.endMs || 0, animationEndMs(e.animations)),
      ),
    );
    commit({
      ...layout,
      elements,
      timeline: timeline
        ? { ...timeline, durationMs: Math.min(3600000, endpoint) }
        : null,
    });
  }
  function snapTime(n: number) {
    const grid = snap ? Math.round(n / 100) * 100 : Math.round(n);
    const cue = timeline?.cues.find((c) => Math.abs(c.timeMs - grid) < 150);
    return Math.max(0, snap && cue ? cue.timeMs : grid);
  }
  function drag(
    event: PointerEvent<HTMLElement>,
    start: number,
    end: number,
    change: (start: number, end: number) => void,
    edge: "move" | "end" = "move",
  ) {
    if (disabled || !timeline) return;
    event.preventDefault();
    event.stopPropagation();
    const target = (event.currentTarget.closest(".timeline-block") ||
        event.currentTarget) as HTMLElement,
      rail = target.closest(".timeline-rail") as HTMLElement;
    const width = rail.getBoundingClientRect().width;
    const origin = event.clientX;
    target.setPointerCapture(event.pointerId);
    let finalStart = start,
      finalEnd = end;
    const move = (e: globalThis.PointerEvent) => {
      const delta = ((e.clientX - origin) / width) * timeline.durationMs;
      if (edge === "move") {
        finalStart = Math.min(
          timeline.durationMs - (end - start),
          snapTime(start + delta),
        );
        finalEnd = finalStart + end - start;
      } else {
        finalEnd = Math.max(
          start + 100,
          Math.min(timeline.durationMs, snapTime(end + delta)),
        );
      }
      target.style.left = `${(finalStart / timeline.durationMs) * 100}%`;
      target.style.width = `${((finalEnd - finalStart) / timeline.durationMs) * 100}%`;
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", cancel);
      change(finalStart, finalEnd);
    };
    const cancel = () => {
      target.style.left = `${(start / timeline.durationMs) * 100}%`;
      target.style.width = `${((end - start) / timeline.durationMs) * 100}%`;
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", cancel);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", cancel);
  }
  async function addClip() {
    const asset = media.find((a) => a.id === assetId);
    if (!asset || !timeline) return;
    const node = document.createElement(asset.kind as "audio" | "video");
    node.preload = "metadata";
    node.src = `/api/projects/${project.id}/assets/${asset.id}`;
    setMessage("Reading media duration…");
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error("Could not read media duration.")),
          15000,
        );
        node.onloadedmetadata = () => {
          clearTimeout(timeout);
          resolve();
        };
        node.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("Media could not be opened."));
        };
      });
      if (!Number.isFinite(node.duration) || node.duration <= 0)
        throw new Error("This media has no finite duration.");
      const duration = Math.round(node.duration * 1000);
      if (time + duration > 3600000)
        throw new Error("Timeline scenes are limited to one hour.");
      const id = crypto.randomUUID();
      save({
        ...timeline,
        durationMs: Math.max(timeline.durationMs, time + duration),
        clips: [
          ...timeline.clips,
          {
            id,
            assetId: asset.id,
            name: asset.filename,
            kind: asset.kind as "audio" | "video",
            startMs: time,
            sourceInMs: 0,
            sourceOutMs: duration,
            sourceDurationMs: duration,
            volume: 1,
            required: false,
            thresholdPercent: 90,
            x: 40,
            y: 40,
            width: 480,
            height: 270,
            fadeInMs: 0,
            fadeOutMs: 0,
          },
        ],
      });
      setClipId(id);
      select(null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not add clip.",
      );
    } finally {
      node.removeAttribute("src");
      node.load();
    }
  }
  async function waveform() {
    if (!clip) return;
    setDecoding(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/projects/${project.id}/assets/${clip.assetId}`,
      );
      if (!response.ok) throw new Error("Media could not be loaded.");
      const blob = await response.blob();
      if (blob.size > 25 * 1024 * 1024)
        throw new Error("Waveforms are limited to 25 MB sources.");
      const decoded = await decodeWaveform(await blob.arrayBuffer());
      setWaveforms({ ...waveforms, [clip.assetId]: decoded });
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Waveform decoding failed.",
      );
    } finally {
      setDecoding(false);
    }
  }
  if (!timeline)
    return (
      <details className="scene-timeline">
        <summary>Timeline and layers</summary>
        <p>
          Enable a shared scene clock to schedule objects and media. Existing
          attached media stays unchanged until explicitly added as a clip.
        </p>
        <button
          type="button"
          className="button button-outline"
          disabled={disabled}
          onClick={() => {
            const endpoint = Math.max(
              30000,
              ...layout.elements.flatMap((e) => [
                e.timing?.endMs || 0,
                e.animations?.exit.effect !== "none"
                  ? (e.animations?.exit.delayMs || 0) +
                    (e.animations?.exit.durationMs || 0)
                  : 0,
              ]),
            );
            commit({
              ...layout,
              timeline: {
                version: 1,
                durationMs: Math.min(3600000, endpoint),
                printTimeMs: 0,
                clips: [],
                cues: [],
              },
            });
          }}
        >
          Enable scene timeline
        </button>
      </details>
    );
  return (
    <details className="scene-timeline" open>
      <summary>Timeline and layers</summary>
      <fieldset disabled={disabled}>
        <div className="timeline-tools">
          <button
            type="button"
            className="button button-outline"
            onClick={() => {
              setPreview(true);
              setPlaying(!playing);
            }}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            className="button button-outline"
            onClick={() => {
              setPreview(true);
              setTime(0);
              setPlaying(false);
            }}
          >
            Restart
          </button>
          <button
            type="button"
            className="button button-outline"
            aria-pressed={!preview}
            onClick={() => {
              setPlaying(false);
              setPreview(!preview);
            }}
          >
            {preview ? "Return to editing" : "Preview at playhead"}
          </button>
          <output>{(time / 1000).toFixed(2)} s</output>
          <label className="timeline-checkbox">
            <input
              type="checkbox"
              checked={snap}
              onChange={(e) => setSnap(e.target.checked)}
            />
            Snap
          </label>
          <label>
            Zoom
            <select
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            >
              {[1, 2, 4, 8].map((n) => (
                <option key={n} value={n}>
                  {n}×
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="timeline-tools">
          <Seconds
            label="Scene duration"
            value={timeline.durationMs}
            min={100}
            onChange={(n) => save({ ...timeline, durationMs: n })}
          />
          <Seconds
            label="Playhead"
            value={time}
            max={timeline.durationMs}
            onChange={(n) => {
              setTime(n);
              setPreview(true);
            }}
          />
          <Seconds
            label="Word snapshot time"
            value={timeline.printTimeMs}
            max={timeline.durationMs}
            onChange={(n) => save({ ...timeline, printTimeMs: n })}
          />
          <label>
            Media
            <select
              aria-label="Timeline media"
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            >
              <option value="">Choose audio or video</option>
              {media.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.filename}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button button-outline"
            disabled={!assetId}
            onClick={() => void addClip()}
          >
            Add clip at playhead
          </button>
        </div>
        <div className="timeline-scroll">
          <div style={{ minWidth: `${zoom * 100}%` }}>
            <div className="timeline-row">
              <span className="timeline-label">Layers · front to back</span>
              <div className="timeline-rail timeline-ruler">
                <input
                  aria-label="Timeline playhead"
                  type="range"
                  min={0}
                  max={timeline.durationMs}
                  step={50}
                  value={time}
                  onChange={(e) => {
                    setTime(Number(e.target.value));
                    setPreview(true);
                  }}
                />
                {Array.from({ length: 6 }, (_, i) => (
                  <span key={i} style={{ left: `${i * 20}%` }}>
                    {((timeline.durationMs * i) / 5000).toFixed(1)}s
                  </span>
                ))}
              </div>
            </div>
            {[...layout.elements].reverse().map((element) => {
              const start = element.timing?.startMs || 0,
                end = element.timing?.endMs || timeline.durationMs;
              const a = element.animations;
              return (
                <div className="timeline-row" key={element.id}>
                  <button
                    type="button"
                    className="timeline-label"
                    aria-pressed={selection === element.id}
                    onClick={() => {
                      select(element.id);
                      setClipId(null);
                      setPlaying(false);
                      setPreview(false);
                    }}
                  >
                    {element.locked ? "🔒 " : ""}
                    {element.groupId ? `${element.groupId} / ` : ""}
                    {element.name ||
                      element.text.slice(0, 30) ||
                      element.shapeName ||
                      element.kind}
                  </button>
                  <div className="timeline-rail">
                    <span
                      className="timeline-playhead"
                      style={{ left: `${(time / timeline.durationMs) * 100}%` }}
                    />
                    <button
                      type="button"
                      className="timeline-block"
                      aria-label={`Move ${element.name || element.kind} timing`}
                      style={{
                        left: `${(start / timeline.durationMs) * 100}%`,
                        width: `${((end - start) / timeline.durationMs) * 100}%`,
                      }}
                      disabled={element.locked}
                      onPointerDown={(e) =>
                        drag(e, start, end, (startMs, endMs) =>
                          changeElement(element, {
                            timing: { startMs, endMs },
                          }),
                        )
                      }
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                          e.preventDefault();
                          const n = Math.max(
                            0,
                            Math.min(
                              timeline.durationMs - (end - start),
                              start + (e.key === "ArrowLeft" ? -100 : 100),
                            ),
                          );
                          changeElement(element, {
                            timing: { startMs: n, endMs: n + end - start },
                          });
                        }
                      }}
                    >
                      {element.name || element.kind}
                      <span
                        className="timeline-resize"
                        aria-hidden="true"
                        onPointerDown={(e) =>
                          drag(
                            e,
                            start,
                            end,
                            (startMs, endMs) =>
                              changeElement(element, {
                                timing: { startMs, endMs },
                              }),
                            "end",
                          )
                        }
                      />
                    </button>
                    {a &&
                      (["entrance", "presentation", "exit"] as const)
                        .filter((phase) => a[phase].effect !== "none")
                        .map((phase) => {
                          const entranceEnd =
                            a.entrance.effect === "none"
                              ? 0
                              : a.entrance.delayMs + a.entrance.durationMs;
                          const start =
                            phase === "presentation"
                              ? entranceEnd + a[phase].delayMs
                              : a[phase].delayMs;
                          const duration =
                            a[phase].durationMs * (a[phase].iterations || 1);
                          return (
                            <button
                              key={phase}
                              type="button"
                              className={`timeline-block timeline-phase timeline-${phase}`}
                              aria-label={`Move ${phase} animation`}
                              style={{
                                left: `${(start / timeline.durationMs) * 100}%`,
                                width: `${(duration / timeline.durationMs) * 100}%`,
                              }}
                              onPointerDown={(e) =>
                                drag(e, start, start + duration, (n) =>
                                  changeElement(element, {
                                    animations: alignExitTiming({
                                      ...a,
                                      [phase]: {
                                        ...a[phase],
                                        delayMs:
                                          phase === "presentation"
                                            ? Math.max(0, n - entranceEnd)
                                            : n,
                                      },
                                    }),
                                  }),
                                )
                              }
                            >
                              {phase}
                              <span
                                className="timeline-resize"
                                aria-hidden="true"
                                onPointerDown={(e) =>
                                  drag(
                                    e,
                                    start,
                                    start + duration,
                                    (_, end) =>
                                      changeElement(element, {
                                        animations: alignExitTiming({
                                          ...a,
                                          [phase]: {
                                            ...a[phase],
                                            durationMs: Math.max(
                                              100,
                                              Math.min(
                                                60000,
                                                Math.round(
                                                  (end - start) /
                                                    (a[phase].iterations || 1),
                                                ),
                                              ),
                                            ),
                                          },
                                        }),
                                      }),
                                    "end",
                                  )
                                }
                              />
                            </button>
                          );
                        })}
                  </div>
                </div>
              );
            })}
            {timeline.clips.map((c) => (
              <div className="timeline-row" key={c.id}>
                <button
                  type="button"
                  className="timeline-label"
                  aria-pressed={clipId === c.id}
                  onClick={() => {
                    setClipId(c.id);
                    select(null);
                  }}
                >
                  {c.kind === "audio" ? "♫" : "▶"} {c.name}
                </button>
                <div className="timeline-rail">
                  <span
                    className="timeline-playhead"
                    style={{ left: `${(time / timeline.durationMs) * 100}%` }}
                  />
                  <button
                    type="button"
                    className={`timeline-block timeline-${c.kind}`}
                    style={{
                      left: `${(c.startMs / timeline.durationMs) * 100}%`,
                      width: `${((c.sourceOutMs - c.sourceInMs) / timeline.durationMs) * 100}%`,
                    }}
                    aria-label={`Move ${c.name} clip`}
                    onPointerDown={(e) => {
                      setClipId(c.id);
                      drag(
                        e,
                        c.startMs,
                        c.startMs + c.sourceOutMs - c.sourceInMs,
                        (start) =>
                          save({
                            ...timeline,
                            clips: timeline.clips.map((item) =>
                              item.id === c.id
                                ? { ...item, startMs: start }
                                : item,
                            ),
                          }),
                      );
                    }}
                    onClick={() => {
                      setClipId(c.id);
                      select(null);
                    }}
                  >
                    {waveforms[c.assetId] && (
                      <svg
                        viewBox={`0 0 ${Math.max(1, Math.ceil(((c.sourceOutMs - c.sourceInMs) / waveforms[c.assetId].durationMs) * 200))} 40`}
                        preserveAspectRatio="none"
                        aria-label="Audio waveform"
                      >
                        {waveforms[c.assetId].peaks
                          .slice(
                            Math.floor(
                              (c.sourceInMs / waveforms[c.assetId].durationMs) *
                                200,
                            ),
                            Math.max(
                              1,
                              Math.ceil(
                                (c.sourceOutMs /
                                  waveforms[c.assetId].durationMs) *
                                  200,
                              ),
                            ),
                          )
                          .map((n, i) => (
                            <path
                              key={i}
                              d={`M ${i} ${20 - n * 20} V ${20 + n * 20}`}
                              stroke="currentColor"
                            />
                          ))}
                      </svg>
                    )}
                    <span>{c.name}</span>
                    <span
                      className="timeline-resize"
                      aria-hidden="true"
                      onPointerDown={(e) =>
                        drag(
                          e,
                          c.startMs,
                          c.startMs + c.sourceOutMs - c.sourceInMs,
                          (_, end) => {
                            const next = {
                              ...c,
                              sourceOutMs: Math.min(
                                c.sourceDurationMs || 3600000,
                                c.sourceInMs + end - c.startMs,
                              ),
                            };
                            if (
                              next.fadeInMs + next.fadeOutMs >
                              next.sourceOutMs - next.sourceInMs
                            ) {
                              setMessage(
                                "Shorten clip fades before trimming further.",
                              );
                              return;
                            }
                            save({
                              ...timeline,
                              clips: timeline.clips.map((item) =>
                                item.id === c.id ? next : item,
                              ),
                            });
                          },
                          "end",
                        )
                      }
                    />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        {selected && (
          <div className="timeline-properties">
            <label>
              Group name
              <input
                maxLength={120}
                value={selected.groupId || ""}
                onChange={(e) =>
                  changeElement(selected, { groupId: e.target.value || null })
                }
              />
            </label>
            <Seconds
              label="Object start"
              value={selected.timing?.startMs || 0}
              max={(selected.timing?.endMs || timeline.durationMs) - 100}
              onChange={(n) =>
                changeElement(selected, {
                  timing: {
                    startMs: n,
                    endMs: selected.timing?.endMs || timeline.durationMs,
                  },
                })
              }
            />
            <Seconds
              label="Object end"
              value={selected.timing?.endMs || timeline.durationMs}
              min={(selected.timing?.startMs || 0) + 100}
              max={timeline.durationMs}
              onChange={(n) =>
                changeElement(selected, {
                  timing: { startMs: selected.timing?.startMs || 0, endMs: n },
                })
              }
            />
            {(["entrance", "presentation", "exit"] as const).map((phase) => {
              const a = selected.animations || defaultAnimations();
              const entranceEnd =
                a.entrance.effect === "none"
                  ? 0
                  : a.entrance.delayMs + a.entrance.durationMs;
              const absolute =
                phase === "presentation"
                  ? entranceEnd + a.presentation.delayMs
                  : a[phase].delayMs;
              return (
                <div key={phase}>
                  <strong>{phase}</strong>
                  <Seconds
                    label={`${phase} scene start`}
                    value={absolute}
                    max={timeline.durationMs}
                    onChange={(n) => {
                      const animations = alignExitTiming({
                        ...a,
                        [phase]: {
                          ...a[phase],
                          delayMs:
                            phase === "presentation"
                              ? Math.max(0, n - entranceEnd)
                              : n,
                        },
                      });
                      changeElement(selected, { animations });
                    }}
                  />
                  <Seconds
                    label={`${phase} duration`}
                    min={100}
                    max={60000}
                    value={a[phase].durationMs}
                    onChange={(n) =>
                      changeElement(selected, {
                        animations: alignExitTiming({
                          ...a,
                          [phase]: { ...a[phase], durationMs: n },
                        }),
                      })
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
        {clip && (
          <div className="timeline-properties">
            <button
              type="button"
              className="button button-outline"
              aria-pressed={audition.muted.includes(clip.id)}
              onClick={() =>
                onAudition({
                  ...audition,
                  muted: audition.muted.includes(clip.id)
                    ? audition.muted.filter((id) => id !== clip.id)
                    : [...audition.muted, clip.id],
                })
              }
            >
              Mute preview
            </button>
            <button
              type="button"
              className="button button-outline"
              aria-pressed={audition.solo === clip.id}
              onClick={() =>
                onAudition({
                  ...audition,
                  solo: audition.solo === clip.id ? null : clip.id,
                })
              }
            >
              Solo preview
            </button>
            <label>
              Clip name
              <input
                maxLength={200}
                value={clip.name}
                onChange={(e) => updateClip({ name: e.target.value })}
              />
            </label>
            <Seconds
              label="Clip start"
              value={clip.startMs}
              onChange={(n) => updateClip({ startMs: n })}
            />
            <Seconds
              label="Source in"
              value={clip.sourceInMs}
              max={clip.sourceOutMs - 1}
              onChange={(n) => updateClip({ sourceInMs: n })}
            />
            <Seconds
              label="Source out"
              value={clip.sourceOutMs}
              max={clip.sourceDurationMs || 3600000}
              min={clip.sourceInMs + 1}
              onChange={(n) => updateClip({ sourceOutMs: n })}
            />
            <label>
              Volume (%)
              <input
                type="number"
                min={0}
                max={100}
                value={Math.round(clip.volume * 100)}
                onChange={(e) => {
                  const n = e.target.valueAsNumber;
                  if (n >= 0 && n <= 100) updateClip({ volume: n / 100 });
                }}
              />
            </label>
            <Seconds
              label="Fade in"
              value={clip.fadeInMs}
              max={60000}
              onChange={(n) => updateClip({ fadeInMs: n })}
            />
            <Seconds
              label="Fade out"
              value={clip.fadeOutMs}
              max={60000}
              onChange={(n) => updateClip({ fadeOutMs: n })}
            />
            <label className="timeline-checkbox">
              <input
                type="checkbox"
                checked={clip.required}
                onChange={(e) => updateClip({ required: e.target.checked })}
              />
              Require viewing/listening
            </label>
            <label>
              Required coverage (%)
              <input
                type="number"
                min={1}
                max={100}
                value={clip.thresholdPercent}
                onChange={(e) => {
                  const n = e.target.valueAsNumber;
                  if (n >= 1 && n <= 100) updateClip({ thresholdPercent: n });
                }}
              />
            </label>
            {clip.kind === "video" &&
              (["x", "y", "width", "height", "layerOrder"] as const).map(
                (field) => (
                  <label key={field}>
                    Video {field === "layerOrder" ? "layer order" : field}
                    <input
                      type="number"
                      min={
                        field === "layerOrder"
                          ? 0
                          : field === "width" || field === "height"
                            ? 1
                            : -10000
                      }
                      max={field === "layerOrder" ? 4001 : 10000}
                      value={clip[field] ?? 4001}
                      onChange={(e) => {
                        const n = e.target.valueAsNumber;
                        if (
                          Number.isFinite(n) &&
                          n >=
                            (field === "layerOrder"
                              ? 0
                              : field === "width" || field === "height"
                                ? 1
                                : -10000) &&
                          n <= (field === "layerOrder" ? 4001 : 10000)
                        )
                          updateClip({ [field]: n });
                      }}
                    />
                  </label>
                ),
              )}
            <button
              type="button"
              className="button button-outline"
              disabled={decoding}
              onClick={() => void waveform()}
            >
              {decoding ? "Decoding…" : "Generate local waveform"}
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() =>
                save({
                  ...timeline,
                  clips: timeline.clips.filter((c) => c.id !== clip.id),
                })
              }
            >
              Delete clip
            </button>
          </div>
        )}
        <div className="timeline-tools">
          <button
            type="button"
            className="button button-outline"
            onClick={() =>
              save({
                ...timeline,
                cues: [
                  ...timeline.cues,
                  { name: `Cue ${timeline.cues.length + 1}`, timeMs: time },
                ],
              })
            }
          >
            Add cue at playhead
          </button>
          {timeline.cues.map((cue, index) => (
            <span key={index}>
              <button
                type="button"
                className="button button-outline"
                onClick={() => {
                  setTime(cue.timeMs);
                  setPreview(true);
                }}
              >
                {cue.name} · {(cue.timeMs / 1000).toFixed(1)}s
              </button>
              <button
                type="button"
                aria-label={`Delete ${cue.name}`}
                onClick={() =>
                  save({
                    ...timeline,
                    cues: timeline.cues.filter((_, i) => i !== index),
                  })
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <p className="field-hint">
          Drag blocks to move them; use the time fields to resize precisely.
          Source media is preserved. Required clips earn credit only from
          playback. Groups label related layers.
        </p>
      </fieldset>
      {message && <p role="status">{message}</p>}
    </details>
  );
}
