import { useEffect, useRef, useState } from "react";
import { accessRequest } from "./access-request";

const denied = { canEdit: false, canExport: false, canManageMembers: false, canEnhance: false };
type Permissions = typeof denied;
type Check = { projectId: string; sessionId: string; status: "checking" | "verified" | "unavailable" | "denied"; hasGrant: boolean; permissions: Permissions };

/** Grants are memory-only display context, never authorization for a new request. */
export function useProjectAccess(projectId: string, sessionId: string) {
  const [check, setCheck] = useState<Check | null>(null);
  const retry = useRef<() => void>(() => {});
  useEffect(() => {
    if (!sessionId || !projectId) return;
    let alive = true;
    let checking = false;
    let hasGrant = false;
    let permissions = denied;
    const controller = new AbortController();
    setCheck({ projectId, sessionId, status: "checking", hasGrant, permissions });
    async function refresh() {
      if (!alive || checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const response = await accessRequest(`/api/projects/${projectId}/permissions`, "permissions", { cache: "no-store", signal: controller.signal });
        if (!alive) return;
        if ([401, 403, 404].includes(response.status)) {
          hasGrant = false;
          permissions = denied;
          setCheck({ projectId, sessionId, status: "denied", hasGrant, permissions });
          return;
        }
        if (!response.ok) throw new Error("Access unavailable");
        const next = await response.json() as Permissions;
        if (Object.keys(denied).some(key => typeof next?.[key as keyof Permissions] !== "boolean")) throw new Error("Invalid permission response");
        if (!alive) return;
        hasGrant = true;
        permissions = next;
        setCheck({ projectId, sessionId, status: "verified", hasGrant, permissions });
      } catch {
        if (alive) setCheck({ projectId, sessionId, status: "unavailable", hasGrant, permissions });
      } finally { checking = false; }
    }
    retry.current = () => { void refresh(); };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    const refreshOnFocus = () => { void refresh(); };
    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => { alive = false; controller.abort(); retry.current = () => {}; clearInterval(timer); window.removeEventListener("focus", refreshOnFocus); document.removeEventListener("visibilitychange", refreshOnFocus); };
  }, [sessionId, projectId]);
  const current: Check = !sessionId || !projectId
    ? { projectId, sessionId, status: "verified", hasGrant: true, permissions: { canEdit: !sessionId, canExport: !sessionId, canManageMembers: false, canEnhance: !sessionId } }
    : check?.projectId === projectId && check.sessionId === sessionId ? check : { projectId, sessionId, status: "checking", hasGrant: false, permissions: denied };
  return { ...current, retry: () => retry.current() };
}
