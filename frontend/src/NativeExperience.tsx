import { useEffect, useRef } from "react";
import { mountExperience } from "../../backend/app/static/scene-experience.js";
import "../../backend/app/static/scene-experience.css";

export type Experience = {
  version: 1; heading: string; introduction: string;
  flow: { label: string; description: string }[];
  reveals: { label: string; explanation: string }[];
  conclusion: string; motion: boolean;
  background: string; foreground: string; accent: string; accentText: string; diagramAccent: string;
};

export function NativeExperience({ experience }: { experience: Experience }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (root.current) return mountExperience(root.current, experience);
  }, [experience]);
  return <div ref={root} />;
}
