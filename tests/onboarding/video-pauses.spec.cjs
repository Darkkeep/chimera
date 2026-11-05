const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { execFileSync } = require("node:child_process");
const python = require("./python.cjs");
const AxeBuilder = require("@axe-core/playwright").default;
const servers = [];
test.afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

const choices = [
  { id: "inspect", label: "Inspect first", feedback: "Observe the situation before acting." },
  { id: "proceed", label: "Proceed now", feedback: "Consider the consequences before proceeding." },
];
async function fixture(request, pauses = true) {
  let project = await (await request.post("/api/projects", { data: { title: "Synthetic video reflections" } })).json();
  async function change(method, suffix, data) {
    const response = await request[method](`/api/projects/${project.id}${suffix}`, {
      headers: { "If-Match": `"${project.storyboard.revision}"` }, ...data,
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    project = await response.json();
  }
  await change("post", "/scenes", { data: { title: "Reflect while watching" } });
  await change("post", "/assets", { multipart: { file: {
    name: "reflection.mp4", mimeType: "video/mp4",
    buffer: await fs.readFile("tests/fixtures/timeline-qualification.mp4"),
  } } });
  const asset = project.storyboard.assets.find(item => item.kind === "video");
  await change("patch", `/assets/${asset.id}/metadata`, { data: {
    transcript: "Synthetic silent test pattern.", captionsVtt: "WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nTest pattern.",
    language: "en",
  } });
  await change("patch", `/assets/${asset.id}/attribution`, { data: {
    attributionStatus: "complete", attributionText: "Synthetic test fixture.",
  } });
  await change("patch", `/scenes/${project.storyboard.scenes[0].id}`, { data: { visualLayout: {
    enabled: true, elements: [], timeline: {
      durationMs: 3000, cues: [{ name: "Ordinary cue", timeMs: 2500 }],
      clips: [{ id: "v", assetId: asset.id, kind: "video", sourceOutMs: 3000, required: true }],
      pauses: pauses ? [
        { id: "first", timeMs: 500, prompt: "What would you do first?", choices },
        { id: "second", timeMs: 1500, prompt: "What happens next?", choices },
      ] : [],
    },
  } } });
  return project;
}
async function openAuthor(page, project) {
  await page.addInitScript(id => localStorage.setItem("chimera.activeProjectId", id), project.id);
  await page.route("**/api/projects", route => route.fulfill({ json: [project] }));
  await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, route => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Resume authoring", exact: true }).click();
}
async function exportCourse(page, request, project, profile, testInfo) {
  const response = await request.get(`/api/projects/${project.id}/${profile}.zip`);
  expect(response.ok(), await response.text()).toBeTruthy();
  const archive = testInfo.outputPath("course.zip"), directory = testInfo.outputPath("course");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(archive, await response.body());
  execFileSync(python, ["-m", "zipfile", "-e", archive, directory]);
  // WebKit's media loader requires an actual HTTP range server, not route.fulfill.
  const server = require("node:http").createServer(async (req, res) => {
    const filename = decodeURIComponent(new URL(req.url, "http://localhost").pathname.slice(1)) || "index.html";
    const absolute = path.resolve(directory, filename);
    if (!absolute.startsWith(path.resolve(directory) + path.sep)) { res.writeHead(403).end(); return; }
    try {
    const body = await fs.readFile(absolute);
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    res.writeHead(range ? 206 : 200, {
      "Accept-Ranges": "bytes", "Content-Length": String(end - start + 1),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${body.length}` } : {}),
      "Content-Type":
      filename.endsWith(".js") ? "text/javascript" : filename.endsWith(".json") ? "application/json" :
        filename.endsWith(".mp4") ? "video/mp4" : "text/html" });
    res.end(body.subarray(start, end + 1));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  await page.addInitScript(profile => {
    if (profile === "standalone") return;
    const legacy = profile === "scorm-12", api = {};
    const state = JSON.parse(localStorage.getItem("video-lms") || "{}");
    window.writes = [];
    api[legacy ? "LMSInitialize" : "Initialize"] = () => "true";
    api[legacy ? "LMSGetValue" : "GetValue"] = key => state[key] || "";
    api[legacy ? "LMSSetValue" : "SetValue"] = (key, value) => {
      state[key] = value; window.writes.push([key, value]); return "true";
    };
    api[legacy ? "LMSCommit" : "Commit"] = () => { localStorage.setItem("video-lms", JSON.stringify(state)); return "true"; };
    api[legacy ? "LMSFinish" : "Terminate"] = () => "true";
    window[legacy ? "API" : "API_1484_11"] = api;
  }, profile);
  await page.goto(profile === "standalone" ? pathToFileURL(path.join(directory, "index.html")).href : `http://127.0.0.1:${server.address().port}/index.html`);
}

test("video pause authoring saves, reopens, previews and uses revision guards", async ({ page, request }) => {
  const project = await fixture(request, false);
  await openAuthor(page, project);
  await page.getByRole("button", { name: "Edit scene", exact: true }).click();
  let editor = page.getByRole("dialog").last();
  await editor.getByRole("spinbutton", { name: "Playhead (s)", exact: true }).fill("0.5");
  await editor.getByRole("button", { name: "Add video pause at playhead", exact: true }).click();
  await editor.getByRole("textbox", { name: "Pause 1 prompt", exact: true }).fill("Which approach?");
  await editor.getByRole("textbox", { name: "Pause 1 response 1", exact: true }).fill("Inspect first");
  await editor.getByRole("textbox", { name: "Pause 1 feedback 1", exact: true }).fill("Observation matters.");
  await editor.getByRole("button", { name: "Preview reflection", exact: true }).click();
  await expect(editor.getByRole("region", { name: "Video reflection", exact: true })).toContainText("Which approach?");
  await editor.getByRole("button", { name: "Save scene", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const saved = await (await request.get(`/api/projects/${project.id}`)).json();
  const timeline = saved.storyboard.scenes[0].visualLayout.timeline;
  expect(timeline.pauses[0]).toMatchObject({ timeMs: 500, prompt: "Which approach?" });
  expect(timeline.cues).toEqual(project.storyboard.scenes[0].visualLayout.timeline.cues);
  const suffix = `/api/projects/${project.id}/scenes/${project.storyboard.scenes[0].id}`;
  expect((await request.patch(suffix, { headers: { "If-Match": `"${project.storyboard.revision}"` },
    data: { visualLayout: saved.storyboard.scenes[0].visualLayout } })).status()).toBe(412);
  expect((await request.patch(suffix, { headers: { "If-Match": `"${saved.storyboard.revision}"` },
    data: { visualLayout: { ...saved.storyboard.scenes[0].visualLayout,
      timeline: { ...timeline, pauses: [{ ...timeline.pauses[0], required: true }] } } } })).status()).toBe(422);
  await page.getByRole("button", { name: "Edit scene", exact: true }).click();
  editor = page.getByRole("dialog").last();
  await expect(editor.getByRole("textbox", { name: "Pause 1 prompt", exact: true })).toHaveValue("Which approach?");
  await editor.getByRole("button", { name: "Remove video pause 1", exact: true }).click();
  await editor.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(editor.getByRole("textbox", { name: "Pause 1 prompt", exact: true })).toHaveValue("Which approach?");
});

for (const profile of ["scorm-12", "scorm-2004", "standalone"]) {
  test(`${profile} pauses exactly, supports keyboard retries/skip/replay and preserves tracking`, async ({ page, request }, testInfo) => {
    const project = await fixture(request);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await exportCourse(page, request, project, profile, testInfo);
    const reflection = page.getByRole("region", { name: "Video reflection", exact: true });
    await expect(page.locator("video")).toHaveJSProperty("readyState", 4);
    await page.getByRole("button", { name: "Play scene", exact: true }).click();
    await expect(reflection).toBeVisible();
    await expect(reflection.getByRole("heading")).toBeFocused();
    expect(await page.evaluate(() => window.__CHIMERA_SCENE_TRANSPORT.currentTime)).toBe(500);
    await expect(page.locator("video")).toHaveJSProperty("paused", true);
    await expect.poll(() => page.locator("video").evaluate(node => node.currentTime)).toBeCloseTo(0.5, 2);
    await page.screenshot({ path: testInfo.outputPath("video-reflection.png") });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.__CHIMERA_SCENE_TRANSPORT.currentTime)).toBe(500);
    const scores = profile === "standalone" ? {} : await page.evaluate(() => Object.fromEntries(window.writes.filter(([key]) => key.includes("score"))));
    await reflection.getByRole("button", { name: "Inspect first", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(reflection.getByRole("status")).toHaveText(choices[0].feedback);
    await reflection.getByRole("button", { name: "Proceed now", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(reflection.getByRole("status")).toHaveText(choices[1].feedback);
    if (profile !== "standalone") {
      // Media timeupdate events may save identical LMS scores while paused.
      // Verify every reported value, rather than the timing-dependent write count.
      const scoreWrites = await page.evaluate(() => window.writes.filter(([key]) => key.includes("score")));
      expect(Object.fromEntries(scoreWrites)).toEqual(scores);
      expect(scoreWrites.every(([key, value]) => scores[key] === value)).toBe(true);
      const saved = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("video-lms"))["cmi.suspend_data"]));
      expect(saved.videoProgress[`clock:${project.storyboard.scenes[0].id}`]).toEqual({ position: 0.5, duration: 3, watchedRanges: [] });
      expect(saved.assessments).toEqual({});
      expect(Buffer.byteLength(JSON.stringify(saved))).toBeLessThan(4096);
      expect(await page.evaluate(() => window.writes.some(([key, value]) =>
        ["cmi.completion_status", "cmi.core.lesson_status"].includes(key) && ["completed", "passed"].includes(value)))).toBe(false);
      await page.reload();
      const resume = page.getByRole("dialog", { name: "Continue your course?", exact: true });
      await expect(resume).toBeVisible();
      expect(await page.evaluate(() => window.writes)).toEqual([]);
      await resume.getByRole("button", { name: "Continue", exact: true }).click();
      expect(await page.evaluate(() => window.__CHIMERA_SCENE_TRANSPORT.currentTime)).toBe(500);
      await page.getByRole("button", { name: "Play scene", exact: true }).click();
      await expect(reflection).toBeVisible();
      await expect(reflection.getByRole("status")).toBeEmpty();
    }
    await reflection.getByRole("button", { name: /(?:Skip reflection and continue|Continue video)/ }).click();
    await expect(reflection.getByRole("heading")).toHaveText("What happens next?");
    expect(await page.evaluate(() => window.__CHIMERA_SCENE_TRANSPORT.currentTime)).toBe(1500);
    await reflection.getByRole("button", { name: "Skip reflection and continue", exact: true }).click();
    await expect(reflection).toBeHidden();
    await page.getByRole("button", { name: "Pause scene", exact: true }).click();
    await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeVisible();
    await page.getByRole("slider", { name: "Scene playback time", exact: true }).fill("2500");
    await expect(reflection).toBeHidden();
    await page.getByRole("slider", { name: "Scene playback time", exact: true }).fill("0");
    await page.getByRole("button", { name: "Play scene", exact: true }).click();
    await expect(reflection.getByRole("heading")).toHaveText("What would you do first?");
    const alternative = page.locator("details").filter({ hasText: "Video reflections: text alternative and replay" });
    await expect(alternative).not.toHaveAttribute("open");
    await page.evaluate(() => dispatchEvent(new Event("beforeprint")));
    await expect(alternative).toHaveAttribute("open");
    await expect(alternative).toContainText(choices[0].feedback);
    await page.evaluate(() => dispatchEvent(new Event("afterprint")));
    await expect(alternative).not.toHaveAttribute("open");
    await page.getByText("Video reflections: text alternative and replay", { exact: true }).click();
    await page.getByRole("button", { name: "Replay reflection at 1.5 s", exact: true }).click();
    await expect(reflection.getByRole("heading")).toHaveText("What happens next?");
    if (profile !== "standalone") {
      const accessibility = await new AxeBuilder({ page }).include('section[aria-label="Video reflection"]').analyze();
      expect(accessibility.violations).toEqual([]);
      await page.reload();
      await page.getByRole("button", { name: "Start over", exact: true }).click();
      expect(await page.evaluate(() => window.__CHIMERA_SCENE_TRANSPORT.currentTime)).toBe(0);
      await expect(reflection).toBeHidden();
      const reset = await page.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem("video-lms"))["cmi.suspend_data"]));
      expect(Object.keys(reset.videoProgress).filter(key => key.startsWith("clip:"))).toEqual([]);
    } else {
      await page.reload();
      expect(await page.evaluate(() => window.__CHIMERA_SCENE_TRANSPORT.currentTime)).toBe(0);
    }
    await page.getByRole("slider", { name: "Scene playback time", exact: true }).fill("2000");
    await page.getByRole("button", { name: "Play scene", exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__CHIMERA_SCENE_TRANSPORT.currentTime)).toBe(3000);
    await expect(page.locator("#runtime-status")).not.toContainText("Buffering media");
    await expect(reflection).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test("course preview restores the pause clock but not responses and rejects invalid clocks", async ({ page, request }) => {
  const project = await fixture(request);
  await openAuthor(page, project);
  await page.getByRole("button", { name: "Preview course", exact: true }).click();
  const dialog = page.getByRole("dialog").last();
  const reflection = dialog.getByRole("region", { name: "Video reflection", exact: true });
  await dialog.getByRole("slider", { name: "Scene playback time", exact: true }).fill("500");
  await dialog.getByRole("button", { name: "Play scene", exact: true }).click();
  await expect(reflection).toBeVisible();
  await reflection.getByRole("button", { name: "Inspect first", exact: true }).click();
  await expect.poll(() => page.evaluate(id => JSON.parse(localStorage.getItem(`chimera.preview.${id}`)).videoProgress, project.id))
    .toMatchObject({ [`clock:${project.storyboard.scenes[0].id}`]: { position: 0.5 } });
  await page.reload();
  await page.getByRole("button", { name: "Resume authoring", exact: true }).click();
  await page.getByRole("button", { name: "Preview course", exact: true }).click();
  await expect(dialog.getByRole("slider", { name: "Scene playback time", exact: true })).toHaveValue("500");
  await dialog.getByRole("button", { name: "Play scene", exact: true }).click();
  await expect(reflection.getByRole("status")).toBeEmpty();
  // Corrupt stored data only after the live player has saved/unmounted.
  await dialog.getByRole("button", { name: "Close course preview", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.evaluate(({ id, sceneId }) => {
    const key = `chimera.preview.${id}`, saved = JSON.parse(localStorage.getItem(key));
    saved.videoProgress[`clock:${sceneId}`] = { position: 1.5, duration: 999, watchedRanges: [] };
    localStorage.setItem(key, JSON.stringify(saved));
  }, { id: project.id, sceneId: project.storyboard.scenes[0].id });
  await page.reload();
  await page.getByRole("button", { name: "Resume authoring", exact: true }).click();
  await page.getByRole("button", { name: "Preview course", exact: true }).click();
  await expect(dialog.getByRole("slider", { name: "Scene playback time", exact: true })).toHaveValue("0");
});
