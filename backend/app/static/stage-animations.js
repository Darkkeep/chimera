export function playStageAnimations(root, elements, elapsedMs = 0) {
  const active = [];
  if (globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return () => {};
  const frames = {
    fade: [{ opacity: 0 }, { opacity: 1 }],
    "slide-up": [{ opacity: 0, translate: "0 48px" }, { opacity: 1, translate: "0 0" }],
    "slide-left": [{ opacity: 0, translate: "-64px 0" }, { opacity: 1, translate: "0 0" }],
    zoom: [{ opacity: 0, scale: "0.8" }, { opacity: 1, scale: "1" }],
    bounce: [{ opacity: 0, translate: "0 56px", offset: 0 }, { opacity: 1, translate: "0 -12px", offset: 0.65 }, { opacity: 1, translate: "0 5px", offset: 0.85 }, { opacity: 1, translate: "0 0", offset: 1 }],
    pulse: [{ scale: "1" }, { scale: "1.06" }, { scale: "1" }],
    sway: [{ rotate: "0deg" }, { rotate: "-4deg" }, { rotate: "4deg" }, { rotate: "0deg" }],
    highlight: [{ backgroundColor: "transparent" }, { backgroundColor: "#fff0a6" }, { backgroundColor: "transparent" }],
  };
  const nodes = new Map([...root.querySelectorAll("[data-scene-element]")].map(node => [node.dataset.sceneElement, node]));
  for (const element of elements) {
    const node = nodes.get(element.id);
    const animation = element.animations;
    if (!node?.animate || !animation) continue;
    const entrance = animation.entrance;
    const presentation = animation.presentation;
    const exit = animation.exit;
    let entranceEnd = 0;
    if (entrance && frames[entrance.effect]) {
      active.push(node.animate(frames[entrance.effect], { duration: entrance.durationMs, delay: entrance.delayMs, easing: "ease-out", fill: "backwards" }));
      entranceEnd = entrance.delayMs + entrance.durationMs;
    }
    if (presentation && frames[presentation.effect]) {
      active.push(node.animate(frames[presentation.effect], { duration: presentation.durationMs, delay: entranceEnd + presentation.delayMs, iterations: presentation.iterations, easing: "ease-in-out", fill: "none" }));
    }
    if (exit && frames[exit.effect]) {
      active.push(node.animate([...frames[exit.effect]].reverse(), { duration: exit.durationMs, delay: exit.delayMs, easing: "ease-in", fill: "forwards" }));
    }
  }
  const preference = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  active.forEach(animation => { animation.currentTime = elapsedMs; });
  const cancel = () => active.forEach(animation => animation.cancel());
  const changed = event => { if (event.matches) cancel(); };
  preference?.addEventListener("change", changed);
  return () => { cancel(); preference?.removeEventListener("change", changed); };
}