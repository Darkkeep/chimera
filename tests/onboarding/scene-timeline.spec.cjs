const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const python = require("./python.cjs");
const AxeBuilder = require("@axe-core/playwright").default;
const servers = [];
test.beforeEach(async({page})=>{
  // Font fitting must not wait on unrelated internet font downloads in local fixtures.
  await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//,route=>route.abort());
});
test.afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise((resolve) => {
      server.closeAllConnections();
      server.close(resolve);
    });
});

async function course(request, title) {
  let p = await (
    await request.post("/api/projects", { data: { title } })
  ).json();
  const response = await request.post(`/api/projects/${p.id}/scenes`, {
    data: { title: "A timed scene", extractedText: ["Listen and observe"] },
    headers: { "If-Match": `"${p.storyboard.revision}"` },
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

test("grouped layers move together and Undo/Redo preserves the group", async ({
  page,
  request,
}) => {
  const p = await course(request, "Grouped layers");
  await page.addInitScript(
    (id) => localStorage.setItem("chimera.activeProjectId", id),
    p.id,
  );
  await page.route("**/api/projects", (route) => route.fulfill({ json: [p] }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Resume authoring", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit scene", exact: true }).click();
  const editor = page.getByRole("dialog").last();
  await editor
    .getByRole("combobox", { name: "Insert shape" })
    .selectOption("rectangle");
  await editor
    .getByRole("combobox", { name: "Insert shape" })
    .selectOption("ellipse");
  await editor
    .locator(".visual-inspector summary")
    .filter({ hasText: /^Layers$/ })
    .click();
  await editor
    .locator(".visual-layer-checks")
    .getByLabel("rectangle", { exact: true })
    .check();
  await editor
    .locator(".visual-layer-checks")
    .getByLabel("ellipse", { exact: true })
    .check();
  await editor
    .getByRole("button", { name: "Group checked layers", exact: true })
    .click();
  const ellipse = editor.getByRole("button", {
    name: "ellipse element",
    exact: true,
  });
  await ellipse.focus();
  await ellipse.press("Shift+ArrowRight");
  await editor.getByRole("button", { name: "Undo", exact: true }).click();
  await editor.getByRole("button", { name: "Redo", exact: true }).click();
  await editor.getByRole("button", { name: "Save scene", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const saved = await (await request.get(`/api/projects/${p.id}`)).json();
  const shapes = saved.storyboard.scenes[0].visualLayout.elements.filter(
    (e) => e.nativeShape,
  );
  expect(shapes.map((e) => e.x)).toEqual([50, 50]);
  expect(shapes.every((e) => e.groupId === "Group 1")).toBe(true);
});
test("native shapes, alpha, effects, timeline seconds and layer edits survive save/reopen", async ({
  page,
  request,
}, testInfo) => {
  const p = await course(request, "Timeline authoring");
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    (id) => localStorage.setItem("chimera.activeProjectId", id),
    p.id,
  );
  await page.route("**/api/projects", (r) => r.fulfill({ json: [p] }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Resume authoring", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit scene", exact: true }).click();
  const editor = page.getByRole("dialog").last();
  await editor
    .getByRole("combobox", { name: "Insert shape", exact: true })
    .selectOption("ellipse");
  await editor
    .locator(".visual-inspector summary")
    .filter({ hasText: /^Appearance$/ })
    .click();
  await editor
    .getByRole("textbox", { name: "Layer name", exact: true })
    .fill("Blue circle");
  await editor
    .getByRole("spinbutton", { name: "Object opacity (%)", exact: true })
    .fill("40");
  await editor
    .locator(".visual-effect summary")
    .filter({ hasText: "Drop shadow" })
    .click();
  await editor
    .locator(".visual-effect")
    .filter({ has: page.locator("summary", { hasText: "Drop shadow" }) })
    .getByRole("checkbox", { name: "Enabled" })
    .check();
  await editor.getByText("Timeline and layers", { exact: true }).click();
  await editor
    .getByRole("button", { name: "Enable scene timeline", exact: true })
    .click();
  await editor
    .getByRole("spinbutton", { name: "Scene duration (s)", exact: true })
    .fill("90");
  await editor
    .getByRole("spinbutton", { name: "Object start (s)", exact: true })
    .fill("4.2");
  await editor
    .getByRole("spinbutton", { name: "Object end (s)", exact: true })
    .fill("12");
  await editor.getByRole("button", { name: "Save scene", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const saved = await (await request.get(`/api/projects/${p.id}`)).json();
  const shape = saved.storyboard.scenes[0].visualLayout.elements.find(
    (e) => e.name === "Blue circle",
  );
  expect(shape.nativeShape).toBe("ellipse");
  expect(shape.appearance.opacity).toBe(0.4);
  expect(shape.appearance.shadow.enabled).toBe(true);
  expect(shape.timing).toEqual({ startMs: 4200, endMs: 12000 });
  await page
    .getByRole("button", { name: "Preview course", exact: true })
    .click();
  const preview = page.getByRole("dialog").last();
  const element = preview.locator(`[data-scene-element="${shape.id}"]`);
  await expect(element).toHaveCSS("visibility", "hidden");
  await preview
    .getByRole("slider", { name: "Scene playback time" })
    .fill("5000");
  await expect(element).toHaveCSS("visibility", "visible");
  await expect(element.locator(":scope > div")).toHaveCSS("opacity", "0.4");
  await page.screenshot({ path: testInfo.outputPath("timeline-preview.png") });
  await preview
    .getByRole("button", { name: "Close course preview", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit scene", exact: true }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Scene duration (s)", exact: true }),
  ).toHaveValue("90");
  const reopened = page.getByRole("dialog").last();
  await reopened
    .locator(".timeline-label")
    .filter({ hasText: "Blue circle" })
    .click();
  await reopened
    .locator(".visual-inspector summary")
    .filter({ hasText: /^Appearance$/ })
    .click();
  await reopened.screenshot({
    path: testInfo.outputPath("timeline-editor.png"),
  });
  await reopened.locator(".scene-timeline").scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("timeline-controls.png") });
  expect(
    (await new AxeBuilder({ page }).include(".visual-editor").analyze())
      .violations,
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await reopened.screenshot({
    path: testInfo.outputPath("timeline-editor-mobile.png"),
  });
  for(const width of [320,768,1024,1440]){
    await page.setViewportSize({width,height:900});
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.evaluate(()=>{document.documentElement.dataset.theme='light';document.documentElement.style.colorScheme='light';});
  expect((await new AxeBuilder({page}).include('.visual-editor').analyze()).violations).toEqual([]);
  await reopened.screenshot({path:testInfo.outputPath('timeline-editor-light.png')});
  expect(errors).toEqual([]);
});

test("scheduled audio supports local waveforms, preview solo/mute, fades and source trimming", async ({
  page,
  request,
}) => {
  let p = await course(request, "Scheduled audio");
  const rate = 16000,
    samples = rate * 2,
    wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++)
    wav.writeInt16LE(
      Math.round(Math.sin((i / rate) * Math.PI * 440) * 2000),
      44 + i * 2,
    );
  const upload = await request.post(`/api/projects/${p.id}/assets`, {
    headers: { "If-Match": `"${p.storyboard.revision}"` },
    multipart: {
      file: { name: "tone.wav", mimeType: "audio/wav", buffer: wav },
    },
  });
  expect(upload.ok()).toBeTruthy();
  p = await upload.json();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    (id) => localStorage.setItem("chimera.activeProjectId", id),
    p.id,
  );
  await page.route("**/api/projects", (r) => r.fulfill({ json: [p] }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", { name: "Resume authoring", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit scene", exact: true }).click();
  const editor = page.getByRole("dialog").last();
  await editor.getByText("Timeline and layers", { exact: true }).click();
  await editor
    .getByRole("button", { name: "Enable scene timeline", exact: true })
    .click();
  await editor
    .getByRole("combobox", { name: "Timeline media" })
    .selectOption(p.storyboard.assets[0].id);
  await editor
    .getByRole("button", { name: "Add clip at playhead", exact: true })
    .click();
  await editor
    .getByRole("spinbutton", { name: "Source in (s)", exact: true })
    .fill("0.5");
  await editor
    .getByRole("spinbutton", { name: "Source out (s)", exact: true })
    .fill("1.5");
  await editor
    .getByRole("spinbutton", { name: "Fade in (s)", exact: true })
    .fill("0.2");
  await editor.getByRole("button", { name: "Generate local waveform" }).click();
  await expect(editor.locator('svg[aria-label="Audio waveform"]')).toHaveCount(
    1,
  );
  await editor
    .getByRole("button", { name: "Preview at playhead", exact: true })
    .click();
  await editor
    .getByRole("button", { name: "Mute preview", exact: true })
    .click();
  await expect
    .poll(() => editor.locator("audio").evaluate((n) => n.volume))
    .toBe(0);
  await editor
    .getByRole("spinbutton", { name: "Playhead (s)", exact: true })
    .fill("0.5");
  await editor
    .getByRole("button", { name: "Mute preview", exact: true })
    .click();
  await expect
    .poll(() => editor.locator("audio").evaluate((n) => n.volume))
    .toBe(1);
  await expect
    .poll(() => editor.locator("audio").evaluate((n) => n.currentTime))
    .toBeCloseTo(1, 1);
  await editor.getByRole("button", { name: "Save scene", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const saved = await (await request.get(`/api/projects/${p.id}`)).json();
  expect(
    saved.storyboard.scenes[0].visualLayout.timeline.clips[0],
  ).toMatchObject({
    sourceInMs: 500,
    sourceOutMs: 1500,
    fadeInMs: 200,
    volume: 1,
  });
  expect(errors).toEqual([]);
});

for (const profile of ["scorm-2004", "scorm-12", "standalone"])
  test(`${profile} seeks timed objects and source-trimmed required media without granting completion`, async ({
    page,
    request,
  }, testInfo) => {
    let p = await course(request, `Timed ${profile}`);
    const upload = await request.post(`/api/projects/${p.id}/assets`, {
      multipart: {
        file: {
          name: "timed.mp4",
          mimeType: "video/mp4",
          buffer: await fs.readFile(
            "tests/fixtures/timeline-qualification.mp4",
          ),
        },
      },
      headers: { "If-Match": `"${p.storyboard.revision}"` },
    });
    expect(upload.ok(), await upload.text()).toBeTruthy();
    p = await upload.json();
    const asset = p.storyboard.assets.find((a) => a.kind === "video");
    for (const [endpoint, data] of [
      [
        "metadata",
        {
          transcript: "Synthetic silent test video.",
          captionsVtt:
            "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nSynthetic test video.",
          language: "en",
        },
      ],
      [
        "attribution",
        {
          attributionText: "Synthetic test fixture.",
          attributionStatus: "complete",
        },
      ],
    ]) {
      const response = await request.patch(
        `/api/projects/${p.id}/assets/${asset.id}/${endpoint}`,
        { data, headers: { "If-Match": `"${p.storyboard.revision}"` } },
      );
      expect(response.ok(), await response.text()).toBeTruthy();
      p = await response.json();
    }
    const patch = await request.patch(
      `/api/projects/${p.id}/scenes/${p.storyboard.scenes[0].id}`,
      {
        headers: { "If-Match": `"${p.storyboard.revision}"` },
        data: {
          visualLayout: {
            enabled: true,
            elements: [
              {
                id: "shape",
                kind: "shape",
                nativeShape: "diamond",
                x: 60,
                y: 40,
                width: 200,
                height: 200,
                appearance: { opacity: 0.5, shadow: { enabled: true } },
                timing: { startMs: 4000, endMs: 15000 },
              },
            ],
            timeline: {
              durationMs: 20000,
              clips: [
                {
                  id: "v",
                  assetId: asset.id,
                  kind: "video",
                  startMs: 12000,
                  sourceInMs: 500,
                  sourceOutMs: 1500,
                  required: true,
                },
              ],
            },
          },
        },
      },
    );
    expect(patch.ok(), await patch.text()).toBeTruthy();
    p = await patch.json();
    const zip = await request.get(`/api/projects/${p.id}/${profile}.zip`);
    expect(zip.ok(), await zip.text()).toBeTruthy();
    const archive = testInfo.outputPath("course.zip"),
      directory = testInfo.outputPath("course");
    await fs.writeFile(archive, await zip.body());
    await fs.mkdir(directory, { recursive: true });
    execFileSync(python, ["-m", "zipfile", "-e", archive, directory]);
    const http = require("node:http");
    const server = http.createServer(async (req, res) => {
      const file =
        decodeURIComponent(
          new URL(req.url, "http://localhost").pathname.slice(1),
        ) || "index.html";
      const absolute = path.resolve(directory, file);
      if (!absolute.startsWith(path.resolve(directory) + path.sep)) {
        res.writeHead(403).end();
        return;
      }
      try {
        const body = await fs.readFile(absolute);
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
        const start = range ? Number(range[1]) : 0,
          end = range?.[2]
            ? Math.min(Number(range[2]), body.length - 1)
            : body.length - 1;
        res.writeHead(range ? 206 : 200, {
          "Content-Type": file.endsWith(".mp4")
            ? "video/mp4"
            : file.endsWith(".js")
              ? "text/javascript"
              : file.endsWith(".json")
                ? "application/json"
                : "text/html",
          "Content-Length": end - start + 1,
          "Accept-Ranges": "bytes",
          ...(range
            ? { "Content-Range": `bytes ${start}-${end}/${body.length}` }
            : {}),
        });
        res.end(body.subarray(start, end + 1));
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    servers.push(server);
    await page.addInitScript((profile) => {
      window.__writes = [];
      if (profile === "standalone") return;
      const api = {};
      for (const name of [
        "Initialize",
        "Commit",
        "Terminate",
        "LMSInitialize",
        "LMSCommit",
        "LMSFinish",
      ])
        api[name] = () => "true";
      for (const name of ["GetValue", "LMSGetValue"]) api[name] = () => "";
      for (const name of ["SetValue", "LMSSetValue"])
        api[name] = (key, value) => {
          window.__writes.push([key, value]);
          return "true";
        };
      window[profile === "scorm-2004" ? "API_1484_11" : "API"] = api;
    }, profile);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      profile === "standalone"
        ? require("node:url").pathToFileURL(path.join(directory, "index.html"))
            .href
        : `http://127.0.0.1:${server.address().port}/index.html`,
    );
    await expect(
      page.getByRole("button", { name: "Play scene", exact: true }),
    ).toBeVisible();
    await expect(page.locator('[data-scene-element="shape"]')).toHaveCSS(
      "visibility",
      "hidden",
    );
    await page
      .getByRole("slider", { name: "Scene playback time" })
      .fill("12500");
    await expect(page.locator('[data-scene-element="shape"]')).toHaveCSS(
      "visibility",
      "visible",
    );
    await expect
      .poll(() =>
        page.locator(".visual-stage video").evaluate((n) => n.currentTime),
      )
      .toBeCloseTo(1, 1);
    await expect(page.locator(".visual-stage video")).toHaveJSProperty(
      "paused",
      true,
    );
    await page
      .getByRole("slider", { name: "Scene playback time" })
      .fill("18000");
    await expect(page.locator('[data-scene-element="shape"]')).toHaveCSS(
      "visibility",
      "hidden",
    );
    if (profile !== "standalone")
      expect(
        await page.evaluate(() =>
          window.__writes.some(
            ([key, value]) =>
              (key === "cmi.completion_status" ||
                key === "cmi.core.lesson_status") &&
              ["completed", "passed"].includes(value),
          ),
        ),
      ).toBe(false);
    await page
      .getByRole("slider", { name: "Scene playback time" })
      .fill("12000");
    await page.getByRole("button", { name: "Play scene", exact: true }).click();
    await expect
      .poll(() => page.locator("video").evaluate((n) => n.played.length))
      .toBeGreaterThan(0);
    if (profile !== "standalone")
      await expect
        .poll(() =>
          page.evaluate(() =>
            window.__writes.some(
              ([key, value]) =>
                (key === "cmi.completion_status" ||
                  key === "cmi.core.lesson_status") &&
                ["completed", "passed"].includes(value),
            ),
          ),
        )
        .toBe(true);
    expect(errors).toEqual([]);
  });
