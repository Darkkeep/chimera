export type AccessOperation = "auth-config" | "identity" | "darkrogue-session" | "darkrogue-login" | "admission" | "project-list" | "project-open" | "permissions" | "workspace";

/** Bounded requests and allowlisted diagnostics: no URLs, identities or bodies. */
export async function accessRequest(input: string, operation: AccessOperation, init: RequestInit = {}, fetcher: typeof fetch = window.fetch.bind(window), timeoutMs = 10000): Promise<Response> {
  const started = performance.now();
  let status: number | string = "network";
  let serverMs: number | undefined;
  let authorityMs: number | undefined;
  let cancel: (() => void) | undefined;
  try {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    if (signal.aborted) throw signal.reason;
    const aborted = new Promise<Response>((_, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      cancel = () => signal.removeEventListener("abort", abort);
    });
    // Bound wrappers too (e.g. a 401 awaiting identity confirmation), not only
    // the underlying browser fetch. The browser request itself is also aborted.
    const response = await Promise.race([fetcher(input, { ...init, signal }), aborted]);
    status = response.status;
    const timing = response.headers.get("Server-Timing") || "";
    const server = timing.match(/chimera;dur=([\d.]+)/);
    const authority = timing.match(/authority;dur=([\d.]+)/);
    serverMs = server ? Number(server[1]) : undefined;
    authorityMs = authority ? Number(authority[1]) : undefined;
    return response;
  } catch (issue) {
    status = issue instanceof DOMException ? issue.name : "network";
    throw issue;
  } finally {
    cancel?.();
    const detail = { operation, status, elapsedMs: Math.round(performance.now() - started), serverMs, authorityMs };
    performance.measure("chimera.access." + operation, { start: started, end: performance.now(), detail });
    if (typeof status !== "number" || status >= 500) console.warn("Chimera access request", detail);
  }
}
