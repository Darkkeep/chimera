export type SurfaceEffect = {
  enabled: boolean;
  color: string;
  opacity: number;
  size: number;
  blur: number;
  angle: number;
};
export type Appearance = {
  opacity: number;
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
  cornerRadius: number;
  shadow: SurfaceEffect;
  bevel: SurfaceEffect;
  emboss: SurfaceEffect;
};
export type Timing = { startMs: number; endMs: number };

export function animationEndMs(
  animations?: {
    entrance: { effect: string; delayMs: number; durationMs: number };
    presentation: {
      effect: string;
      delayMs: number;
      durationMs: number;
      iterations?: number;
    };
    exit: { effect: string; delayMs: number; durationMs: number };
  } | null,
): number {
  if (!animations) return 0;
  const { entrance, presentation, exit } = animations;
  const entranceEnd =
    entrance.effect === "none" ? 0 : entrance.delayMs + entrance.durationMs;
  return Math.max(
    entranceEnd,
    presentation.effect === "none"
      ? 0
      : entranceEnd +
          presentation.delayMs +
          presentation.durationMs * (presentation.iterations || 1),
    exit.effect === "none" ? 0 : exit.delayMs + exit.durationMs,
  );
}
export type TimelineClip = {
  id: string;
  assetId: string;
  name: string;
  kind: "audio" | "video";
  startMs: number;
  sourceInMs: number;
  sourceOutMs: number;
  sourceDurationMs?: number | null;
  volume: number;
  required: boolean;
  thresholdPercent: number;
  x: number;
  y: number;
  width: number;
  height: number;
  layerOrder?: number;
  fadeInMs: number;
  fadeOutMs: number;
};
export type Timeline = {
  version: 1;
  durationMs: number;
  printTimeMs: number;
  clips: TimelineClip[];
  cues: { name: string; timeMs: number }[];
};
export const defaultAppearance = (): Appearance => ({
  opacity: 1,
  fill: "#168da8",
  fillOpacity: 1,
  stroke: "#202020",
  strokeOpacity: 1,
  strokeWidth: 0,
  cornerRadius: 12,
  shadow: {
    enabled: false,
    color: "#000000",
    opacity: 0.35,
    size: 6,
    blur: 4,
    angle: 135,
  },
  bevel: {
    enabled: false,
    color: "#000000",
    opacity: 0.4,
    size: 2,
    blur: 1,
    angle: 135,
  },
  emboss: {
    enabled: false,
    color: "#000000",
    opacity: 0.4,
    size: 2,
    blur: 1,
    angle: 135,
  },
});
