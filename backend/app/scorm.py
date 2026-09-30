import io
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from zipfile import ZIP_DEFLATED, ZipFile
from xml.etree import ElementTree as ET

from .models import ProjectDetail
from .storage import project_path, read_project, slugify, storyboard_transaction
from .validation import validate_project


SCORM_2004_NAMESPACE = "http://www.imsproject.org/xsd/imscp_rootv1p1p2"
SCORM_ADLCP_NAMESPACE = "http://www.adlnet.org/xsd/adlcp_v1p3"
SCORM_ADLSEQ_NAMESPACE = "http://www.adlnet.org/xsd/adlseq_v1p3"
SCORM_IMSSS_NAMESPACE = "http://www.imsglobal.org/xsd/imsss"
SCORM_XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance"
SCORM_SCHEMA_LOCATION = (
    f"{SCORM_2004_NAMESPACE} imscp_v1p1.xsd "
    f"{SCORM_ADLCP_NAMESPACE} adlcp_v1p3.xsd "
    f"{SCORM_ADLSEQ_NAMESPACE} adlseq_v1p3.xsd "
    f"{SCORM_IMSSS_NAMESPACE} imsss_v1p0.xsd"
)
SCORM_12_NAMESPACE = "http://www.imsproject.org/xsd/imscp_rootv1p1p2"
SCORM_12_ADLCP_NAMESPACE = "http://www.adlnet.org/xsd/adlcp_rootv1p2"
SCORM_12_XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance"


PLAYER_JS = r'''(() => {
    const state = { scenes: [], completionSettings: { passingScore: 80, includeOptionalAssessments: false }, current: 0, visited: new Set(), completedAudio: new Set(), assessments: {}, remediation: null, startedAt: Date.now() };
  let api = null;
    let lmsWarningShown = false;
    function runtimeStatus(message) { const status = document.querySelector("#runtime-status"); if (status) status.textContent = message; }
  function findApi() {
    let view = window;
    while (view && view.parent && view.parent !== view) { view = view.parent; if (view.API_1484_11) return view.API_1484_11; }
    return window.API_1484_11 || null;
  }
    function call(name, value) { if (!api) return ""; try { return api[name](...value); } catch (_) { if (!lmsWarningShown) { lmsWarningShown = true; runtimeStatus("LMS tracking is unavailable; progress will not be reported."); } return ""; } }
  function save() {
    call("SetValue", ["cmi.location", String(state.current)]);
        call("SetValue", ["cmi.suspend_data", JSON.stringify({ current: state.current, visited: [...state.visited], completedAudio: [...state.completedAudio], assessments: state.assessments, remediation: state.remediation })]);
    call("Commit", [""]); 
  }
    function settings(scene) { return scene.assessmentSettings || { maxAttempts: 2, passingScore: 100, scoreWeight: 1, remediationSceneId: null }; }
    function assessmentCorrect(item, result) {
        if (item.type === "single-choice" || item.type === "true-false") return result.response.length === 1 && result.response[0] === item.correctResponse;
        if (item.type === "multiple-response") return [...result.response].sort().join("|") === [...item.correctResponses].sort().join("|");
        if (item.type === "ordering") return result.response.join("|") === item.correctOrder.join("|");
        if (item.type === "drag-drop" || item.type === "matching") return item.correctMatches.every(pair => result.matches[pair.sourceIdentifier] === pair.targetIdentifier) && Object.keys(result.matches).length === item.correctMatches.length;
        const answer = item.caseSensitive ? result.textResponse.trim() : result.textResponse.trim().toLocaleLowerCase();
        return item.acceptedAnswers.some(value => answer === (item.caseSensitive ? value.trim() : value.trim().toLocaleLowerCase()));
    }
    function assessmentHtml(scene) {
        const item = scene.assessmentItem;
        if (!item) return "";
        const result = state.assessments[scene.id] || { response: [], matches: {}, textResponse: "", attempts: 0, isCorrect: null };
        const disabled = result.isCorrect === true || result.attempts >= settings(scene).maxAttempts;
        const choiceList = item.type === "single-choice" || item.type === "multiple-response" || item.type === "ordering" ? item.choices : item.type === "true-false" ? [{ identifier: "true", text: "True" }, { identifier: "false", text: "False" }] : [];
        let controls = "";
        if (item.type === "single-choice" || item.type === "true-false" || item.type === "multiple-response") controls = choiceList.map(choice => `<label><input type="${item.type === "multiple-response" ? "checkbox" : "radio"}" name="assessment-response" value="${escapeHtml(choice.identifier)}" ${result.response.includes(choice.identifier) ? "checked" : ""} ${disabled ? "disabled" : ""}> ${escapeHtml(choice.text)}</label>`).join("");
        if (item.type === "ordering") controls = choiceList.map((choice, index) => `<label>${index + 1}. <select data-order-index="${index}" ${disabled ? "disabled" : ""}><option value="">Choose</option>${choiceList.map(option => `<option value="${escapeHtml(option.identifier)}" ${result.response[index] === option.identifier ? "selected" : ""}>${escapeHtml(option.text)}</option>`).join("")}</select></label>`).join("");
        if (item.type === "matching" || item.type === "drag-drop") { const sources = item.type === "matching" ? item.leftItems : item.draggables; const targets = item.type === "matching" ? item.rightItems : item.targets; controls = sources.map(source => `<label>${escapeHtml(source.text)} <select data-match-source="${escapeHtml(source.identifier)}" ${disabled ? "disabled" : ""}><option value="">Choose a match</option>${targets.map(target => `<option value="${escapeHtml(target.identifier)}" ${result.matches[source.identifier] === target.identifier ? "selected" : ""}>${escapeHtml(target.text)}</option>`).join("")}</select></label>`).join(""); }
        if (item.type === "short-answer") controls = `<label>Your answer <input data-text-response maxlength="1000" value="${escapeHtml(result.textResponse)}" ${disabled ? "disabled" : ""}></label>`;
        const outcome = result.attempts ? `<p>${result.isCorrect ? escapeHtml(item.correctFeedback) : escapeHtml(item.incorrectFeedback)} Score: ${result.isCorrect ? 100 : 0}% (${result.attempts}/${settings(scene).maxAttempts} attempts).</p>` : "";
        const remediation = result.isCorrect === false && settings(scene).remediationSceneId ? `<button type="button" data-remediation="${escapeHtml(settings(scene).remediationSceneId)}">Review lesson</button>` : "";
        return `<section class="assessment"><h3>${escapeHtml(item.prompt)}</h3><form id="assessment-form">${controls}<button type="submit" ${disabled ? "disabled" : ""}>${result.attempts ? "Try again" : "Check answer"}</button>${outcome}${remediation}</form></section>`;
    }
    function finish() {
        const required = state.scenes.filter(scene => scene.required);
        const complete = state.scenes.length > 0 && required.every(scene => { if (!state.visited.has(scene.id)) return false; if (!scene.assessmentItem) return true; const result = state.assessments[scene.id]; const config = settings(scene); return result && result.attempts > 0 && (result.isCorrect === true || result.attempts >= config.maxAttempts); }) && state.scenes.filter(scene => scene.audioRequired).every(scene => scene.audioAssets.length > 0 && scene.audioAssets.every(id => state.completedAudio.has(`${scene.id}:${id}`)));
        const scored = state.scenes.filter(scene => scene.assessmentItem && (scene.required || (state.completionSettings.includeOptionalAssessments && (state.assessments[scene.id]?.attempts || 0) > 0)));
        const totalWeight = scored.reduce((sum, scene) => sum + settings(scene).scoreWeight, 0);
        const score = totalWeight ? Math.round(scored.reduce((sum, scene) => sum + (state.assessments[scene.id]?.isCorrect === true ? 100 : 0) * settings(scene).scoreWeight, 0) / totalWeight) : null;
        const passed = complete && (score === null || score >= state.completionSettings.passingScore);
        call("SetValue", ["cmi.completion_status", complete ? "completed" : "incomplete"]);
        call("SetValue", ["cmi.success_status", complete ? (passed ? "passed" : "failed") : "unknown"]);
    call("SetValue", ["cmi.score.min", "0"]);
    call("SetValue", ["cmi.score.max", "100"]);
        call("SetValue", ["cmi.score.raw", String(score ?? 0)]);
        call("SetValue", ["cmi.score.scaled", String((score ?? 0) / 100)]);
    save();
  }
    function text(scene) {
        const paragraphs = (scene.extractedText || []).filter(Boolean).map(value => `<p>${escapeHtml(value)}</p>`).join("");
        return scene.previewImage && paragraphs ? `<details><summary>Read slide text</summary>${paragraphs}</details>` : paragraphs;
    }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;", "'":"&#39;"}[char])); }
    function bindAssessment(scene) {
        const form = document.querySelector("#assessment-form");
        if (!form) return;
        const current = () => state.assessments[scene.id] || { response: [], matches: {}, textResponse: "", attempts: 0, isCorrect: null };
        form.querySelectorAll("[name=assessment-response]").forEach(input => input.addEventListener("change", () => { const response = [...form.querySelectorAll("[name=assessment-response]:checked")].map(entry => entry.value); state.assessments[scene.id] = { ...current(), response, isCorrect: null }; }));
        form.querySelectorAll("[data-order-index]").forEach(input => input.addEventListener("change", () => { const response = [...form.querySelectorAll("[data-order-index]")].sort((a, b) => Number(a.dataset.orderIndex) - Number(b.dataset.orderIndex)).map(entry => entry.value).filter(Boolean); state.assessments[scene.id] = { ...current(), response, isCorrect: null }; }));
        form.querySelectorAll("[data-match-source]").forEach(input => input.addEventListener("change", () => { const matches = { ...current().matches, [input.dataset.matchSource]: input.value }; state.assessments[scene.id] = { ...current(), matches, isCorrect: null }; }));
        const textInput = form.querySelector("[data-text-response]");
        if (textInput) textInput.addEventListener("input", () => { state.assessments[scene.id] = { ...current(), textResponse: textInput.value, isCorrect: null }; });
        form.addEventListener("submit", event => { event.preventDefault(); const result = current(); const hasResponse = result.response.length || Object.keys(result.matches).length || result.textResponse.trim().length; if (!hasResponse || result.isCorrect === true || result.attempts >= settings(scene).maxAttempts) return; state.assessments[scene.id] = { ...result, attempts: result.attempts + 1, isCorrect: assessmentCorrect(scene.assessmentItem, result) }; render(); });
        const remediation = form.querySelector("[data-remediation]");
        if (remediation) remediation.addEventListener("click", () => { state.remediation = { assessmentSceneId: scene.id, remediationSceneId: remediation.dataset.remediation }; state.current = state.scenes.findIndex(item => item.id === remediation.dataset.remediation); save(); render(); });
    }
  function render() {
    const scene = state.scenes[state.current];
    if (!scene) return;
    state.visited.add(scene.id);
    document.querySelector("#scene-title").textContent = scene.title;
    const body = document.querySelector("#scene-body");
    body.innerHTML = (state.remediation && state.remediation.remediationSceneId === scene.id ? `<button type="button" data-return-assessment>Return to question</button>` : "") + text(scene);
    if (scene.previewImage) {
        const slideImage = document.createElement("img");
        slideImage.src = scene.previewImage;
        slideImage.alt = `Slide ${scene.sourceSlide || state.current + 1}: ${scene.title || "Untitled scene"}`;
        slideImage.style.display = "block";
        slideImage.style.maxWidth = "100%";
        slideImage.style.maxHeight = "520px";
        slideImage.style.objectFit = "contain";
        slideImage.style.margin = "0 auto 16px";
        slideImage.style.background = "#fff";
        slideImage.addEventListener("error", () => { runtimeStatus("Slide preview could not be loaded; slide text remains available below."); slideImage.remove(); });
        body.prepend(slideImage);
    }
    document.querySelector("#scene-assessment").innerHTML = assessmentHtml(scene);
    bindAssessment(scene);
    const returnButton = document.querySelector("[data-return-assessment]");
    if (returnButton) returnButton.addEventListener("click", () => { state.current = state.scenes.findIndex(item => item.id === state.remediation.assessmentSceneId); state.remediation = null; save(); render(); });
    const media = document.querySelector("#scene-media"); media.innerHTML = "";
    (scene.imageAssets || []).forEach(id => { const asset = window.__CHIMERA_ASSETS[id]; if (!asset) return; const image = document.createElement("img"); image.src = asset.path; image.alt = scene.decorativeImages.includes(id) ? "" : (scene.imageAltText[id] || asset.filename); image.setAttribute("role", image.alt ? "img" : "presentation"); image.addEventListener("error", () => runtimeStatus(`Media could not be loaded: ${asset.filename}`)); media.appendChild(image); });
    (scene.audioAssets || []).forEach(id => { const asset = window.__CHIMERA_ASSETS[id]; if (!asset) return; const audio = document.createElement("audio"); audio.controls = true; audio.preload = "metadata"; audio.src = asset.path; audio.addEventListener("error", () => runtimeStatus(`Audio could not be loaded: ${asset.filename}`)); if (scene.audioRequired) audio.addEventListener("ended", () => { state.completedAudio.add(`${scene.id}:${id}`); save(); finish(); }); media.appendChild(audio); });
    const status = document.querySelector("#scene-status"); status.textContent = `${state.current + 1} / ${state.scenes.length}`;
    document.querySelector("#previous").disabled = state.current === 0;
    document.querySelector("#next").disabled = state.current === state.scenes.length - 1;
    finish();
  }
  async function start() {
        api = findApi(); if (!api) runtimeStatus("Preview mode: no LMS tracking connection detected."); if (api) { api.Initialize(""); const location = Number(api.GetValue("cmi.location")); if (Number.isInteger(location) && location >= 0) state.current = location; try { const saved = JSON.parse(api.GetValue("cmi.suspend_data") || "{}"); (saved.visited || []).forEach(id => state.visited.add(id)); (saved.completedAudio || []).forEach(key => state.completedAudio.add(key)); state.assessments = saved.assessments || {}; state.remediation = saved.remediation || null; } catch (_) {} }
    const response = await fetch("storyboard.json"); const storyboard = await response.json(); state.scenes = storyboard.scenes || []; state.completionSettings = storyboard.completionSettings || state.completionSettings;
    window.__CHIMERA_ASSETS = Object.fromEntries((storyboard.assets || []).map(asset => [asset.id, { ...asset, path: asset.path }]));
    document.querySelector("#previous").onclick = () => { state.current -= 1; save(); render(); };
    document.querySelector("#next").onclick = () => { state.current += 1; save(); render(); };
    document.querySelector("#course-title").textContent = storyboard.title || "Chimera course";
    render();
  }
  window.addEventListener("beforeunload", () => { save(); if (api) { api.SetValue("cmi.session_time", "PT" + Math.floor((Date.now() - state.startedAt) / 1000) + "S"); api.Terminate(""); } });
  start().catch(error => { document.querySelector("#scene-body").textContent = `Course could not be loaded: ${error.message}`; });
})();
'''


PLAYER_HTML = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chimera course</title>
<style>body{margin:0;background:#f4f5f1;color:#26352c;font:16px system-ui,sans-serif}main{max-width:960px;margin:0 auto;padding:32px 20px}header{border-bottom:1px solid #ccd5cc;margin-bottom:24px}h1{font-size:28px;margin:0 0 20px}h2{font-size:24px}#scene-body{line-height:1.6}#scene-media{display:grid;gap:16px;margin:24px 0}#scene-media img{max-width:100%;max-height:520px;object-fit:contain;background:#fff}audio{width:100%}.controls{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-top:28px}.controls button{border:1px solid #52685a;background:#fff;color:#26352c;padding:10px 16px;border-radius:4px;font:inherit}.controls button:disabled{opacity:.45}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style></head>
<body><main><header><h1 id="course-title">Loading course...</h1><p id="scene-status" aria-live="polite"></p><p id="runtime-status" role="status" aria-live="polite"></p></header><article aria-labelledby="scene-title"><h2 id="scene-title"></h2><div id="scene-body"></div><div id="scene-assessment"></div><div id="scene-media"></div></article><nav class="controls" aria-label="Scene navigation"><button id="previous" type="button">Previous</button><span class="sr-only">Scene navigation</span><button id="next" type="button">Next</button></nav></main><script src="player.js"></script></body></html>'''


def _scorm_12_player() -> str:
    player = PLAYER_JS.replace("API_1484_11", "API")
    player = player.replace('function call(name, value) { if (!api) return "";', 'function call(name, value) { name = { Initialize: "LMSInitialize", GetValue: "LMSGetValue", SetValue: "LMSSetValue", Commit: "LMSCommit", Terminate: "LMSFinish" }[name] || name; if (!api) return "";')
    player = player.replace("api.Initialize", "api.LMSInitialize")
    player = player.replace("api.GetValue", "api.LMSGetValue")
    player = player.replace("api.SetValue", "api.LMSSetValue")
    player = player.replace("api.Commit", "api.LMSCommit")
    player = player.replace("api.Terminate", "api.LMSFinish")
    player = player.replace('"cmi.location"', '"cmi.core.lesson_location"')
    player = player.replace('"cmi.completion_status", complete ? "completed" : "incomplete"', '"cmi.core.lesson_status", complete ? "completed" : "incomplete"')
    player = player.replace('call("SetValue", ["cmi.success_status", complete ? (passed ? "passed" : "failed") : "unknown"]);', 'call("SetValue", ["cmi.core.lesson_status", complete ? (passed ? "passed" : "failed") : "incomplete"]);')
    player = player.replace('"cmi.score.min"', '"cmi.core.score.min"')
    player = player.replace('"cmi.score.max"', '"cmi.core.score.max"')
    player = player.replace('"cmi.score.raw"', '"cmi.core.score.raw"')
    player = player.replace('"cmi.score.scaled"', '"cmi.core.score.scaled"')
    player = player.replace('"cmi.session_time"', '"cmi.core.session_time"')
    return player.replace('call("SetValue", ["cmi.core.lesson_status", complete ? "completed" : "incomplete"]);\n    call("SetValue", ["cmi.core.lesson_status", complete ? (passed ? "passed" : "failed") : "incomplete"]);', 'call("SetValue", ["cmi.core.lesson_status", complete ? (passed ? "passed" : "failed") : "incomplete"]);')


def _safe_package_path(path: str) -> Path:
    relative = Path(path)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"Unsafe package path: {path}")
    return relative


def _compatibility_checks(package: bytes, profile: str) -> list[dict[str, object]]:
    with ZipFile(io.BytesIO(package)) as archive:
        names = set(archive.namelist())
        manifest_present = "imsmanifest.xml" in names
        manifest = ET.fromstring(archive.read("imsmanifest.xml")) if manifest_present else None
        runtime = archive.read("player.js").decode("utf-8") if "player.js" in names else ""

    resources = [] if manifest is None else [
        element for element in manifest.iter()
        if element.tag.rsplit("}", 1)[-1] == "resource"
    ]
    sco_resources = [
        resource for resource in resources
        if any(key.lower().endswith("scormtype") and value.lower() == "sco" for key, value in resource.attrib.items())
    ]
    hrefs = [] if manifest is None else [
        element.attrib["href"] for element in manifest.iter()
        if element.tag.rsplit("}", 1)[-1] in {"resource", "file"} and "href" in element.attrib
    ]
    local_hrefs = [href for href in hrefs if not urlsplit(href).scheme and not urlsplit(href).netloc]
    safe_hrefs = all(not Path(href).is_absolute() and ".." not in Path(href).parts for href in local_hrefs)
    profile_token_found = (
        "API_1484_11" in runtime if profile.startswith("SCORM 2004") else "window.API || null" in runtime
    )
    return [
        {"name": "manifest-at-root", "passed": manifest_present},
        {"name": "manifest-parseable", "passed": manifest is not None},
        {"name": "exactly-one-sco", "passed": len(sco_resources) == 1},
        {"name": "required-player-files", "passed": {"index.html", "player.js", "storyboard.json"}.issubset(names)},
        {"name": "manifest-references-packaged", "passed": safe_hrefs and all(href in names for href in local_hrefs)},
        {"name": "no-external-manifest-references", "passed": len(local_hrefs) == len(hrefs)},
        {"name": "runtime-profile-token", "passed": profile_token_found},
    ]


def _build_report(project: ProjectDetail, profile: str, package: bytes, files: dict[str, bytes], validation_warnings: list[str]) -> dict[str, object]:
    threshold_bytes = project.storyboard.exportSettings.packageWarningThresholdMB * 1024 * 1024
    warnings = list(validation_warnings)
    if len(package) > threshold_bytes:
        warnings.append(
            f"Package is {len(package) / 1024 / 1024:.1f} MB, above the configured {project.storyboard.exportSettings.packageWarningThresholdMB} MB warning threshold."
        )
    asset_sizes = sorted(
        ({"path": path, "sizeBytes": len(content)} for path, content in files.items() if path.startswith("assets/")),
        key=lambda item: item["sizeBytes"],
        reverse=True,
    )
    compatibility_checks = _compatibility_checks(package, profile)
    return {
        "projectId": project.id,
        "projectTitle": project.title,
        "sourceRevision": project.storyboard.revision,
        "exportProfile": profile,
        "buildStatus": "passed-with-warnings" if warnings else "passed",
        "packageSizeBytes": len(package),
        "uncompressedSizeBytes": sum(len(content) for content in files.values()),
        "packageWarningThresholdMB": project.storyboard.exportSettings.packageWarningThresholdMB,
        "largestAssets": asset_sizes[:10],
        "compatibilityChecks": compatibility_checks,
        "sceneCount": len(project.storyboard.scenes),
        "requiredSceneCount": sum(scene.required for scene in project.storyboard.scenes),
        "assetCount": len(project.storyboard.assets),
        "warnings": warnings,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }


def _manifest(project: ProjectDetail) -> bytes:
    for prefix, uri in (("", SCORM_2004_NAMESPACE), ("adlcp", SCORM_ADLCP_NAMESPACE), ("adlseq", SCORM_ADLSEQ_NAMESPACE), ("imsss", SCORM_IMSSS_NAMESPACE), ("xsi", SCORM_XSI_NAMESPACE)):
        ET.register_namespace(prefix, uri)
    root = ET.Element(f"{{{SCORM_2004_NAMESPACE}}}manifest", {
        "identifier": f"CHIMERA-{project.id.upper().replace('-', '_')}",
        f"{{{SCORM_XSI_NAMESPACE}}}schemaLocation": SCORM_SCHEMA_LOCATION,
    })
    ET.SubElement(root, f"{{{SCORM_2004_NAMESPACE}}}metadata").append(ET.fromstring(
        f'<schema xmlns="{SCORM_2004_NAMESPACE}">ADL SCORM</schema>'
    ))
    organizations = ET.SubElement(root, f"{{{SCORM_2004_NAMESPACE}}}organizations", {"default": "ORG-1"})
    organization = ET.SubElement(organizations, f"{{{SCORM_2004_NAMESPACE}}}organization", {"identifier": "ORG-1", "structure": "hierarchical"})
    ET.SubElement(organization, f"{{{SCORM_2004_NAMESPACE}}}title").text = project.title
    item = ET.SubElement(organization, f"{{{SCORM_2004_NAMESPACE}}}item", {"identifier": "ITEM-1", "identifierref": "RES-1"})
    ET.SubElement(item, f"{{{SCORM_2004_NAMESPACE}}}title").text = project.title
    resources = ET.SubElement(root, f"{{{SCORM_2004_NAMESPACE}}}resources")
    resource = ET.SubElement(resources, f"{{{SCORM_2004_NAMESPACE}}}resource", {"identifier": "RES-1", "type": "webcontent", f"{{{SCORM_ADLCP_NAMESPACE}}}scormType": "sco", "href": "index.html"})
    ET.SubElement(resource, f"{{{SCORM_2004_NAMESPACE}}}file", {"href": "index.html"})
    ET.SubElement(resource, f"{{{SCORM_2004_NAMESPACE}}}file", {"href": "player.js"})
    ET.SubElement(resource, f"{{{SCORM_2004_NAMESPACE}}}file", {"href": "storyboard.json"})
    for scene in project.storyboard.scenes:
        if scene.previewImage:
            ET.SubElement(resource, f"{{{SCORM_2004_NAMESPACE}}}file", {"href": scene.previewImage})
    for asset in project.storyboard.assets:
        ET.SubElement(resource, f"{{{SCORM_2004_NAMESPACE}}}file", {"href": asset.path})
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _manifest_12(project: ProjectDetail) -> bytes:
    ET.register_namespace("", SCORM_12_NAMESPACE)
    ET.register_namespace("adlcp", SCORM_12_ADLCP_NAMESPACE)
    ET.register_namespace("xsi", SCORM_12_XSI_NAMESPACE)
    root = ET.Element(f"{{{SCORM_12_NAMESPACE}}}manifest", {
        "identifier": f"CHIMERA-{project.id.upper().replace('-', '_')}-12",
        f"{{{SCORM_12_XSI_NAMESPACE}}}schemaLocation": f"{SCORM_12_NAMESPACE} imscp_rootv1p1p2.xsd {SCORM_12_ADLCP_NAMESPACE} adlcp_rootv1p2.xsd",
    })
    metadata = ET.SubElement(root, f"{{{SCORM_12_NAMESPACE}}}metadata")
    ET.SubElement(metadata, f"{{{SCORM_12_NAMESPACE}}}schema").text = "ADL SCORM"
    organizations = ET.SubElement(root, f"{{{SCORM_12_NAMESPACE}}}organizations", {"default": "ORG-1"})
    organization = ET.SubElement(organizations, f"{{{SCORM_12_NAMESPACE}}}organization", {"identifier": "ORG-1"})
    ET.SubElement(organization, f"{{{SCORM_12_NAMESPACE}}}title").text = project.title
    item = ET.SubElement(organization, f"{{{SCORM_12_NAMESPACE}}}item", {"identifier": "ITEM-1", "identifierref": "RES-1"})
    ET.SubElement(item, f"{{{SCORM_12_NAMESPACE}}}title").text = project.title
    resources = ET.SubElement(root, f"{{{SCORM_12_NAMESPACE}}}resources")
    resource = ET.SubElement(resources, f"{{{SCORM_12_NAMESPACE}}}resource", {"identifier": "RES-1", "type": "webcontent", f"{{{SCORM_12_ADLCP_NAMESPACE}}}scormtype": "sco", "href": "index.html"})
    for filename in ("index.html", "player.js", "storyboard.json"):
        ET.SubElement(resource, f"{{{SCORM_12_NAMESPACE}}}file", {"href": filename})
    for scene in project.storyboard.scenes:
        if scene.previewImage:
            ET.SubElement(resource, f"{{{SCORM_12_NAMESPACE}}}file", {"href": scene.previewImage})
    for asset in project.storyboard.assets:
        ET.SubElement(resource, f"{{{SCORM_12_NAMESPACE}}}file", {"href": asset.path})
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def _published_storyboard_json(project: ProjectDetail) -> bytes:
    storyboard = project.storyboard.model_dump(
        mode="json",
        exclude={"scenes": {"__all__": {"actionDescription", "notes"}}},
    )
    return json.dumps(storyboard, indent=2).encode("utf-8")


def _ensure_build_revision(project: ProjectDetail) -> None:
    current = read_project(project.id)
    if current.storyboard.revision != project.storyboard.revision:
        raise ValueError(
            f"Storyboard changed during SCORM build from revision {project.storyboard.revision} "
            f"to {current.storyboard.revision}. Build again from the current revision."
        )


def build_scorm_2004(project: ProjectDetail) -> tuple[bytes, dict[str, object]]:
    with storyboard_transaction():
        return _build_scorm_2004_locked(project)


def _build_scorm_2004_locked(project: ProjectDetail) -> tuple[bytes, dict[str, object]]:
    _ensure_build_revision(project)
    validation = validate_project(project, target="production")
    errors = [issue.message for issue in validation.issues if issue.severity == "error"]
    if errors:
        raise ValueError("Cannot build SCORM package: " + " ".join(errors))
    root = project_path(project.id).resolve()
    files: dict[str, bytes] = {
        "imsmanifest.xml": _manifest(project),
        "index.html": PLAYER_HTML.encode("utf-8"),
        "player.js": PLAYER_JS.encode("utf-8"),
        "storyboard.json": _published_storyboard_json(project),
    }
    for asset in project.storyboard.assets:
        package_path = _safe_package_path(asset.path).as_posix()
        source = (root / _safe_package_path(asset.path)).resolve()
        if not source.is_relative_to(root / "assets") or not source.is_file():
            raise ValueError(f"Asset is unavailable: {asset.filename}")
        files[package_path] = source.read_bytes()
    for scene in project.storyboard.scenes:
        if not scene.previewImage:
            continue
        package_path = _safe_package_path(scene.previewImage).as_posix()
        source = (root / _safe_package_path(scene.previewImage)).resolve()
        if not source.is_relative_to(root / "renders") or not source.is_file():
            continue
        files[package_path] = source.read_bytes()
    output = io.BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as package:
        for filename, content in files.items():
            package.writestr(filename, content)
    _ensure_build_revision(project)
    report = _build_report(project, "SCORM 2004 4th Edition", output.getvalue(), files, [issue.message for issue in validation.issues if issue.severity == "warning"])
    return output.getvalue(), report


def persist_scorm_build(project: ProjectDetail) -> tuple[bytes, dict[str, object], str]:
    with storyboard_transaction():
        package, report = build_scorm_2004(project)
        project_root = project_path(project.id)
        filename = f"{slugify(project.title)}-scorm2004.zip"
        (project_root / "output" / filename).write_bytes(package)
        report_path = project_root / "reports" / "build-scorm2004.json"
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        return package, report, filename


def build_scorm_12(project: ProjectDetail) -> tuple[bytes, dict[str, object]]:
    with storyboard_transaction():
        return _build_scorm_12_locked(project)


def _build_scorm_12_locked(project: ProjectDetail) -> tuple[bytes, dict[str, object]]:
    _ensure_build_revision(project)
    validation = validate_project(project, target="production")
    errors = [issue.message for issue in validation.issues if issue.severity == "error"]
    if errors:
        raise ValueError("Cannot build SCORM package: " + " ".join(errors))
    root = project_path(project.id).resolve()
    files: dict[str, bytes] = {
        "imsmanifest.xml": _manifest_12(project),
        "index.html": PLAYER_HTML.encode("utf-8"),
        "player.js": _scorm_12_player().encode("utf-8"),
        "storyboard.json": _published_storyboard_json(project),
    }
    for asset in project.storyboard.assets:
        relative = _safe_package_path(asset.path)
        source = (root / relative).resolve()
        if not source.is_relative_to(root / "assets") or not source.is_file():
            raise ValueError(f"Asset is unavailable: {asset.filename}")
        files[relative.as_posix()] = source.read_bytes()
    for scene in project.storyboard.scenes:
        if not scene.previewImage:
            continue
        relative = _safe_package_path(scene.previewImage)
        source = (root / relative).resolve()
        if source.is_relative_to(root / "renders") and source.is_file():
            files[relative.as_posix()] = source.read_bytes()
    output = io.BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as package:
        for filename, content in files.items():
            package.writestr(filename, content)
    _ensure_build_revision(project)
    report = _build_report(project, "SCORM 1.2", output.getvalue(), files, [issue.message for issue in validation.issues if issue.severity == "warning"])
    return output.getvalue(), report


def persist_scorm_12_build(project: ProjectDetail) -> tuple[bytes, dict[str, object], str]:
    with storyboard_transaction():
        package, report = build_scorm_12(project)
        project_root = project_path(project.id)
        filename = f"{slugify(project.title)}-scorm12.zip"
        (project_root / "output" / filename).write_bytes(package)
        report_path = project_root / "reports" / "build-scorm12.json"
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
        return package, report, filename


def read_scorm_report(project_id: str, profile: str) -> dict[str, object]:
    if profile not in {"scorm2004", "scorm12"}:
        raise ValueError("Unsupported SCORM report profile")
    report_path = project_path(project_id) / "reports" / f"build-{profile}.json"
    if not report_path.is_file():
        raise FileNotFoundError(project_id)
    return json.loads(report_path.read_text(encoding="utf-8"))