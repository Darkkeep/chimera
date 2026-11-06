// Imported code runs only in an opaque sandbox; only this host owns LMS tracking.
export function isHTML5Progress(value) {
  return Boolean(value && /^html5-[a-f0-9]{64}$/.test(value.assetId)
    && typeof value.completed === "boolean"
    && (value.score === null || Number.isFinite(value.score) && value.score >= 0 && value.score <= 100)
    && typeof value.suspendData === "string" && new TextEncoder().encode(value.suspendData).length <= 2000
    && typeof value.location === "string" && value.location.length <= 200);
}

export function mountHTML5Activity(root, activity, documentData, options = {}) {
  const host = document.createElement("section");
  host.className = "html5-activity";
  const frame = document.createElement("iframe");
  frame.title = activity.title;
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.style.cssText = "width:100%;height:600px;max-height:80vh;border:1px solid currentColor";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.textContent = "Imported activity. Only reported results are tracked; opening it does not imply completion.";
  const alternative = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "Activity text alternative";
  const description = document.createElement("p");
  description.textContent = activity.alternative;
  alternative.append(summary, description);
  host.append(frame, status, alternative);
  root.appendChild(host);
  const token = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  const progress = isHTML5Progress(options.progress) && options.progress.assetId === activity.assetId ? options.progress : {};
  function bridge(config) {
    function runtimeError(message) {
      parent.postMessage({ type: "chimera-html5-error", token: config.token, message: String(message).slice(0, 500) }, "*");
    }
    window.addEventListener("error", event => runtimeError(event.message || "An activity resource could not load."), true);
    window.addEventListener("unhandledrejection", () => runtimeError("The activity encountered an unhandled asynchronous error."));
    document.addEventListener("securitypolicyviolation", () => runtimeError("The activity tried an unsupported network request or blocked resource."));
    let state = { completed: false, score: null, suspendData: "", location: "", ...config.state };
    let error = "0", initialized = false;
    let values = { "cmi.core.score.min": "0", "cmi.core.score.max": "100", "cmi.score.min": "0", "cmi.score.max": "100" };
    function emit() { parent.postMessage({ type: "chimera-html5-progress", token: config.token, state }, "*"); }
    function fail(code) { error = code; return "false"; }
    function report(value) {
      if (!value || typeof value !== "object"
        || ("score" in value && value.score !== null && (!Number.isFinite(value.score) || value.score < 0 || value.score > 100))
        || ("completed" in value && typeof value.completed !== "boolean")
        || ("suspendData" in value && (typeof value.suspendData !== "string" || new TextEncoder().encode(value.suspendData).length > 2000))
        || ("location" in value && (typeof value.location !== "string" || value.location.length > 200))) return false;
      state = { ...state, ...Object.fromEntries(Object.entries(value).filter(([key]) => ["score", "completed", "suspendData", "location"].includes(key))) };
      emit(); return true;
    }
    window.ChimeraActivity = { getState: () => ({ ...state }), report };
    function get(key) {
      error = "0";
      if (key === "cmi.suspend_data") return state.suspendData;
      if (["cmi.location", "cmi.core.lesson_location"].includes(key)) return state.location;
      if (["cmi.completion_status", "cmi.core.lesson_status"].includes(key)) return state.completed ? "completed" : "incomplete";
      if (["cmi.core.score.raw", "cmi.score.raw"].includes(key)) {
        const prefix = key.startsWith("cmi.core") ? "cmi.core.score" : "cmi.score";
        return state.score === null ? "" : String(Number(values[prefix + ".min"]) + state.score / 100
          * (Number(values[prefix + ".max"]) - Number(values[prefix + ".min"])));
      }
      if (key === "cmi.score.scaled") return state.score === null ? "" : String(state.score / 100);
      if (["cmi.mode", "cmi.core.lesson_mode"].includes(key)) return "normal";
      if (["cmi.entry", "cmi.core.entry"].includes(key)) return state.suspendData || state.location ? "resume" : "ab-initio";
      if (key in values) return values[key];
      error = "401"; return "";
    }
    function set(key, value) {
      error = "0";
      if (typeof value !== "string") return fail("405");
      if (key === "cmi.suspend_data") return report({ suspendData: value }) ? "true" : fail("405");
      if (["cmi.location", "cmi.core.lesson_location"].includes(key)) return report({ location: value }) ? "true" : fail("405");
      if (["cmi.completion_status", "cmi.core.lesson_status", "cmi.success_status"].includes(key)) {
        if (!["completed", "incomplete", "passed", "failed", "not attempted", "unknown"].includes(value)) return fail("405");
        if (key !== "cmi.success_status") report({ completed: ["completed", "passed", "failed"].includes(value) });
        return "true";
      }
      if (["cmi.core.score.min", "cmi.core.score.max", "cmi.score.min", "cmi.score.max"].includes(key)) {
        if (!Number.isFinite(Number(value)) || !value.trim()) return fail("405");
        values[key] = value; return "true";
      }
      if (["cmi.core.score.raw", "cmi.score.raw", "cmi.score.scaled"].includes(key)) {
        if (!value.trim() || !Number.isFinite(Number(value))) return fail("405");
        const prefix = key.startsWith("cmi.core") ? "cmi.core.score" : "cmi.score";
        const min = Number(values[prefix + ".min"]), max = Number(values[prefix + ".max"]);
        if (max <= min && !key.endsWith("scaled")) return fail("405");
        const score = key.endsWith("scaled") ? Number(value) * 100 : (Number(value) - min) / (max - min) * 100;
        return report({ score }) ? "true" : fail("405");
      }
      if (["cmi.exit", "cmi.core.exit", "cmi.session_time", "cmi.core.session_time"].includes(key)) return "true";
      return fail("401");
    }
    const initialize = () => { if (initialized) return fail("101"); initialized = true; error = "0"; return "true"; };
    const commit = () => { if (!initialized) return fail("301"); emit(); error = "0"; return "true"; };
    const finish = () => { const result = commit(); initialized = false; return result; };
    const errorText = code => ({ "0": "No error", "101": "Already initialized", "301": "Not initialized",
      "401": "Element not supported by the Chimera activity adapter", "405": "Invalid value or activity state limit exceeded" })[code] || "Activity adapter error";
    window.API = { LMSInitialize: initialize, LMSGetValue: get, LMSSetValue: set, LMSCommit: commit, LMSFinish: finish,
      LMSGetLastError: () => error, LMSGetErrorString: errorText, LMSGetDiagnostic: errorText };
    window.API_1484_11 = { Initialize: initialize, GetValue: get, SetValue: set, Commit: commit, Terminate: finish,
      GetLastError: () => error, GetErrorString: errorText, GetDiagnostic: errorText };
  }
  const config = JSON.stringify({ token, state: progress }).replace(/</g, "\\u003c");
  const csp = documentData.csp.replace(/"/g, "&quot;");
  frame.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><script>(${bridge.toString()})(${config});</script>${documentData.html}`;
  let loaded = false, navigated = false;
  frame.addEventListener("load", () => {
    if (loaded) {
      navigated = true;
      frame.remove();
      status.textContent = "Activity navigation is unsupported. Reopen this scene and review the package.";
    }
    loaded = true;
  });
  function receive(event) {
    if (navigated || event.source !== frame.contentWindow || event.data?.token !== token) return;
    if (event.data.type === "chimera-html5-error") {
      status.textContent = `Activity error: ${String(event.data.message).slice(0, 500)} Review the package before relying on its results.`;
      return;
    }
    if (event.data.type !== "chimera-html5-progress") return;
    const value = event.data.state;
    if (!isHTML5Progress({ ...value, assetId: activity.assetId })) {
      status.textContent = "Activity reported invalid progress. Results were not accepted.";
      return;
    }
    const result = { assetId: activity.assetId, completed: value.completed, score: value.score,
      suspendData: value.suspendData, location: value.location };
    status.textContent = value.completed
      ? activity.tracking === "scored" && value.score === null ? "Activity reported completion without a score; a score is still required."
        : `Activity completed.${value.score === null ? "" : ` Score: ${value.score}%.`}`
      : "Activity in progress.";
    options.onProgress?.(result);
  }
  globalThis.addEventListener("message", receive);
  let readingOpen = false;
  const beforePrint = () => { readingOpen = alternative.open; alternative.open = true; frame.hidden = true; };
  const afterPrint = () => { alternative.open = readingOpen; frame.hidden = false; };
  globalThis.addEventListener("beforeprint", beforePrint);
  globalThis.addEventListener("afterprint", afterPrint);
  return () => {
    globalThis.removeEventListener("message", receive);
    globalThis.removeEventListener("beforeprint", beforePrint);
    globalThis.removeEventListener("afterprint", afterPrint);
    host.remove();
  };
}
