import { useEffect, useState } from "react";

export type MediaKind = "scene" | "image" | "narration" | "video";
export type MediaConnectionOption = {
  id: string; name: string; provider: string; executor: "pythia" | "chimera";
  configured: boolean; supports: MediaKind[]; readyFor: MediaKind[];
  models: Partial<Record<MediaKind, string>>; revisions: Partial<Record<MediaKind, string>>;
  voice: string; language: string; reason: string;
};
export type MediaConnectionCatalog = {
  connections: MediaConnectionOption[]; defaults: Record<MediaKind, string | null>; videoUnavailableReason: string;
};

export function useMediaConnections() {
  const [catalog, setCatalog] = useState<MediaConnectionCatalog | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const response = await fetch("/api/ai-connections");
        if (!response.ok) throw new Error("AI connections could not be checked. Reopen Settings > AI Connections.");
        const next = await response.json() as MediaConnectionCatalog;
        if (!next || !Array.isArray(next.connections) || !next.defaults || typeof next.defaults !== "object") throw new Error("AI connection information is invalid. Reopen Settings > AI Connections.");
        if (alive) { setCatalog(next); setError(""); }
      } catch (issue) { if (alive) setError(issue instanceof Error ? issue.message : "AI connections unavailable."); }
    }
    void refresh();
    window.addEventListener("chimera:ai-connection-updated", refresh);
    return () => { alive = false; window.removeEventListener("chimera:ai-connection-updated", refresh); };
  }, []);
  return { catalog, error };
}
