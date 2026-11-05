import { useEffect, useRef } from "react";
import { mountExperience } from "../../backend/app/static/scene-experience.js";
import "../../backend/app/static/scene-experience.css";

type Choice = { id: string; label: string; feedback: string };
type BranchVariable = { id: string; label: string; initialValue: boolean };
type VariableAssignment = { variableId: string; value: boolean };
type VariableCondition = { variableId: string; equals: boolean };
export type Activity =
  | { kind: "branching"; id: string; title: string; startNodeId: string;
      variables?: BranchVariable[];
      nodes: { id: string; prompt: string; choices: {
        label: string; feedback: string; nextNodeId: string | null;
        visibleWhen?: VariableCondition | null; setVariables?: VariableAssignment[];
      }[] }[] }
  | { kind: "hotspots"; id: string; title: string; diagramDescription: string; imageAssetId?: string | null;
      hotspots: { id: string; label: string; explanation: string; x: number; y: number }[] }
  | { kind: "sequencing"; id: string; title: string; instruction: string;
      items: { id: string; label: string }[]; feedback: string }
  | { kind: "guided-practice"; id: string; title: string;
      steps: { id: string; prompt: string; hint: string; choices: Choice[]; correctChoiceId: string }[] }
  | { kind: "software-walkthrough"; id: string; title: string;
      steps: { id: string; label: string; screenshotAssetId: string; screenshotAltText: string;
        description: string; actionPrompt: string }[] }
  | { kind: "before-after"; id: string; title: string; instruction: string;
      before: ComparisonImage; after: ComparisonImage; explanation: string }
  | { kind: "external-link"; id: string; title: string; url: string; instruction: string;
      privacyNotice: string; offlineAlternative: string; authorReviewed: boolean }
  | { kind: "learner-conversation"; id: string; title: string; role: string; scenario: string;
      opening: string; responses: string[]; offlineAlternative: string };

type ComparisonImage = { imageAssetId: string; label: string; altText: string; description: string };

export type Experience = {
  version: 1; heading: string; introduction: string;
  flow: { label: string; description: string }[];
  reveals: { label: string; explanation: string }[];
  activities?: Activity[];
  conclusion: string; motion: boolean;
  background: string; foreground: string; accent: string; accentText: string; diagramAccent: string;
};

export type ExperienceImageAsset = { id: string; kind: string; filename: string; attributionText?: string };
export type ExperienceImage = { src: string; filename: string; attributionText: string };

export function experienceImagesForProject(projectId: string, assets: readonly ExperienceImageAsset[]) {
  return Object.fromEntries(assets.filter(asset => asset.kind === "image").map(asset => [asset.id, {
    src: `/api/projects/${projectId}/assets/${asset.id}`,
    filename: asset.filename,
    attributionText: asset.attributionText ?? "",
  }]));
}

export function NativeExperience({ experience, progress, onProgress, imageAssets }: {
  experience: Experience; progress?: Record<string, unknown>; onProgress?: (progress: Record<string, unknown>) => void;
  imageAssets?: Record<string, ExperienceImage>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const savedProgress = useRef(progress);
  const changed = useRef(onProgress);
  const savedImages = useRef(imageAssets);
  savedProgress.current = progress;
  changed.current = onProgress;
  savedImages.current = imageAssets;
  useEffect(() => {
    if (root.current) return mountExperience(root.current, experience, {
      progress: savedProgress.current ? structuredClone(savedProgress.current) : {},
      imageAssets: savedImages.current,
      onProgress: value => changed.current?.(structuredClone(value)),
    });
  }, [experience]);
  return <div ref={root} />;
}
