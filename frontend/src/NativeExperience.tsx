import { useEffect, useRef } from "react";
import { mountExperience } from "../../backend/app/static/scene-experience.js";
import "../../backend/app/static/scene-experience.css";

type Choice = { id: string; label: string; feedback: string };
export type Activity =
  | { kind: "branching"; id: string; title: string; startNodeId: string;
      nodes: { id: string; prompt: string; choices: { label: string; feedback: string; nextNodeId: string | null }[] }[] }
  | { kind: "hotspots"; id: string; title: string; diagramDescription: string;
      hotspots: { id: string; label: string; explanation: string; x: number; y: number }[] }
  | { kind: "sequencing"; id: string; title: string; instruction: string;
      items: { id: string; label: string }[]; feedback: string }
  | { kind: "guided-practice"; id: string; title: string;
      steps: { id: string; prompt: string; hint: string; choices: Choice[]; correctChoiceId: string }[] };

export type Experience = {
  version: 1; heading: string; introduction: string;
  flow: { label: string; description: string }[];
  reveals: { label: string; explanation: string }[];
  activities?: Activity[];
  conclusion: string; motion: boolean;
  background: string; foreground: string; accent: string; accentText: string; diagramAccent: string;
};

export function NativeExperience({ experience, progress, onProgress }: {
  experience: Experience; progress?: Record<string, unknown>; onProgress?: (progress: Record<string, unknown>) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const savedProgress = useRef(progress);
  const changed = useRef(onProgress);
  savedProgress.current = progress;
  changed.current = onProgress;
  useEffect(() => {
    if (root.current) return mountExperience(root.current, experience, {
      progress: savedProgress.current ? structuredClone(savedProgress.current) : {},
      onProgress: value => changed.current?.(structuredClone(value)),
    });
  }, [experience]);
  return <div ref={root} />;
}
