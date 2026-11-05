// Shared semantic delivery in the editor, learner preview and exported courses.
export function mountExperience(root, experience) {
  const section = document.createElement("article");
  section.className = "native-experience";
  section.setAttribute("aria-label", experience.heading);
  section.style.setProperty("--experience-bg", experience.background);
  section.style.setProperty("--experience-fg", experience.foreground);
  section.style.setProperty("--experience-accent", experience.accent);
  section.style.setProperty("--experience-accent-text", experience.accentText);
  section.style.setProperty("--experience-diagram-accent", experience.diagramAccent);
  function text(tag, value, parent = section) {
    const node = document.createElement(tag);
    node.textContent = value;
    parent.appendChild(node);
    return node;
  }
  text("h2", experience.heading);
  text("p", experience.introduction);
  const flow = document.createElement("ol");
  flow.className = "experience-flow";
  flow.setAttribute("aria-label", "Concept flow");
  experience.flow.forEach((step, index) => {
    const item = document.createElement("li");
    text("h3", step.label, item);
    text("p", step.description, item);
    if (index < experience.flow.length - 1) {
      const arrow = text("span", "\u2192", item);
      arrow.className = "experience-arrow";
      arrow.setAttribute("aria-hidden", "true");
    }
    flow.appendChild(item);
  });
  section.appendChild(flow);
  let animations = [];
  function replay() {
    animations.forEach(animation => animation.cancel());
    animations = [];
    if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    [...flow.children].forEach((node, index) => {
      if (node.animate) animations.push(node.animate(
        [{ opacity: .25, transform: "translateY(8px)" }, { opacity: 1, transform: "translateY(0)" }],
        { duration: 450, delay: index * 250, fill: "backwards", easing: "ease-out" },
      ));
    });
  }
  const controls = document.createElement("div");
  controls.className = "experience-controls";
  function button(label, action) {
    const node = text("button", label, controls);
    node.type = "button";
    node.onclick = action;
    return node;
  }
  if (experience.motion) button("Replay diagram", replay);
  const details = [];
  button("Show all explanations", () => details.forEach(node => { node.open = true; }));
  button("Close all explanations", () => details.forEach(node => { node.open = false; }));
  section.appendChild(controls);
  const reveals = document.createElement("div");
  reveals.className = "experience-reveals";
  experience.reveals.forEach(reveal => {
    const detail = document.createElement("details");
    text("summary", reveal.label, detail);
    text("p", reveal.explanation, detail);
    details.push(detail);
    reveals.appendChild(detail);
  });
  section.appendChild(reveals);
  text("p", experience.conclusion).className = "experience-conclusion";
  root.appendChild(section);
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const stop = () => animations.forEach(animation => animation.cancel());
  reduced?.addEventListener("change", stop);
  const print = () => details.forEach(node => { node.open = true; });
  globalThis.addEventListener("beforeprint", print);
  return () => {
    stop();
    reduced?.removeEventListener("change", stop);
    globalThis.removeEventListener("beforeprint", print);
    section.remove();
  };
}
