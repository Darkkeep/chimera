import type { SceneElement, SceneLayout } from "./SceneSurface";

export type TextFitIssue = { id: string; text: string };

export async function fitLayoutText(layout: SceneLayout, repair = false): Promise<{ layout: SceneLayout; issues: TextFitIssue[] }> {
  await document.fonts.ready;
  const next = structuredClone(layout);
  const issues: TextFitIssue[] = [];
  const probe = document.createElement("div");
  probe.style.cssText = "all:initial;position:fixed;left:-20000px;top:0;visibility:hidden;pointer-events:none;box-sizing:content-box;padding:0;border:0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.2;overflow:hidden";
  document.body.appendChild(probe);
  function measure(element: SceneElement) {
    Object.assign(probe.style, {
      width: `${element.width}px`, height: `${element.height}px`, fontSize: `${element.fontSize}px`,
      fontFamily: element.fontFamily, fontWeight: element.bold ? "700" : "400", fontStyle: element.italic ? "italic" : "normal",
      textAlign: element.align,
    });
    probe.textContent = element.text;
    return { fits: probe.scrollHeight <= probe.clientHeight && probe.scrollWidth <= probe.clientWidth, height: probe.scrollHeight };
  }
  try {
    for (const element of next.elements) {
      if (element.kind !== "text" || !element.text.trim()) continue;
      await document.fonts.load(`${element.italic ? "italic " : ""}${element.bold ? "700" : "400"} ${element.fontSize}px ${element.fontFamily}`, element.text);
      let result = measure(element);
      if (!result.fits && repair && !element.locked) {
        if (!element.rotation) {
          const obstacles = [...next.elements.filter(other => other.id !== element.id), ...(next.assessmentRegion ? [next.assessmentRegion] : [])];
          const bottom = obstacles.reduce((limit, other) => {
            const overlapsHorizontally = other.x < element.x + element.width && other.x + other.width > element.x;
            if (!overlapsHorizontally || other.y + other.height <= element.y) return limit;
            return Math.min(limit, Math.max(element.y + element.height, other.y - 8));
          }, next.height);
          element.height = Math.max(element.height, Math.min(result.height + 2, bottom - element.y));
          result = measure(element);
        }
        const minimum = Math.min(18, element.fontSize);
        while (!result.fits && element.fontSize > minimum) {
          element.fontSize = Math.max(minimum, element.fontSize - 1);
          result = measure(element);
        }
      }
      if (!result.fits) issues.push({ id: element.id, text: element.text.slice(0, 100) });
    }
  } finally {
    probe.remove();
  }
  return { layout: next, issues };
}

export function textFitMessage(issues: TextFitIssue[]): string {
  return `Text does not fit: ${issues.map(issue => `"${issue.text}"`).join(", ")}. Use Fit text, enlarge the box, or shorten the text before saving.`;
}