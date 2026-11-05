// Shared semantic delivery in the editor, learner preview and exported courses.
export function mountExperience(root, experience, options = {}) {
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
  if (experience.flow.length) section.appendChild(flow);
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
  if (experience.motion && experience.flow.length) button("Replay diagram", replay);
  const details = [];
  if (experience.reveals.length) {
    button("Show all explanations", () => details.forEach(node => { node.open = true; }));
    button("Close all explanations", () => details.forEach(node => { node.open = false; }));
  }
  if (controls.childElementCount) section.appendChild(controls);
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
  const progress = options.progress || {};
  (experience.activities || []).forEach(activity => {
    const host = text("section", "");
    host.className = "experience-activity";
    host.setAttribute("role", "group");
    host.setAttribute("aria-label", activity.title);
    text("h3", activity.title, host);
    const content = text("div", "", host);
    const staticView = text("details", "", host);
    staticView.className = "experience-static";
    text("summary", "Text alternative and worked solution", staticView);
    const saved = progress[activity.id] || {};
    function update(value) {
      progress[activity.id] = value;
      options.onProgress?.(progress);
    }
    function control(parent, label, action) {
      const node = text("button", label, parent);
      node.type = "button";
      node.onclick = action;
      return node;
    }
    function announce(value) {
      let status = content.querySelector('[role="status"]');
      if (!status) {
        status = text("p", "", content);
        status.setAttribute("role", "status");
      }
      status.textContent = value;
    }
    if (activity.kind === "external-link") {
      // Never restore consent or claimed launch results from saved course/LMS state.
      if (Object.prototype.hasOwnProperty.call(progress, activity.id)) {
        delete progress[activity.id];
        options.onProgress?.(progress);
      }
      const match = typeof activity.url === "string" && activity.url.length <= 2000
        && /^https:\/\/([a-z0-9.-]+)(\/[A-Za-z0-9/_~.-]*)?$/.exec(activity.url);
      const labels = match ? match[1].split(".") : [];
      const valid = match && match[0] === activity.url && match[1].length <= 253 && labels.length >= 2
        && /^[a-z]{2,63}$/.test(labels.at(-1))
        && !["localhost", "local", "internal", "lan", "home"].includes(labels.at(-1))
        && labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
      for (const parent of [content, staticView]) {
        text("p", activity.instruction, parent);
        text("p", `External destination: ${activity.url}`, parent);
        text("p", "Internet access is required. This service opens outside Chimera in a new tab. Its operator receives your IP address and browser information and may use cookies, request sign-in or collect what you enter. Do not share sensitive information. Chimera sends no learner identity, answers or course results through this link; the destination may redirect under its own policies.", parent);
        text("p", `Destination privacy notice: ${activity.privacyNotice}`, parent);
        text("p", "Opening a link does not verify participation or learning and does not change grades or course completion. If offline, blocked or unavailable, use the alternative below. Chimera cannot verify availability or receive results; return to this course tab when finished.", parent);
        text("h4", "Offline learning alternative", parent);
        text("p", activity.offlineAlternative, parent);
      }
      if (!valid || activity.authorReviewed !== true) {
        announce("External launch unavailable: the author must review a valid HTTPS destination. The offline alternative remains available.");
      } else {
        const label = text("label", "", content);
        const consent = text("input", "", label);
        consent.type = "checkbox";
        label.appendChild(document.createTextNode("I understand the external service's privacy notice and choose to leave Chimera."));
        const launch = text("div", "", content);
        function renderLaunch() {
          launch.replaceChildren();
          if (consent.checked) {
            const link = text("a", `Open external experience at ${match[1]} (new tab)`, launch);
            link.href = activity.url;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.referrerPolicy = "no-referrer";
          }
          announce(consent.checked ? "Ready to open the external service. No results will be recorded."
            : "Consent is required to enable the external launch. Consent is not saved.");
        }
        consent.onchange = renderLaunch;
        renderLaunch();
        control(content, "Reset external consent", () => {
          consent.checked = false;
          renderLaunch();
          consent.focus();
        });
      }
    } else if (activity.kind === "branching") {
      const variables = Array.isArray(activity.variables) ? activity.variables : [];
      const initialValues = Object.fromEntries(variables.map(variable => [variable.id, variable.initialValue === true]));
      function isVisible(choice, values) {
        return !choice.visibleWhen || values[choice.visibleWhen.variableId] === choice.visibleWhen.equals;
      }
      function applyAssignments(choice, values) {
        (Array.isArray(choice.setVariables) ? choice.setVariables : []).forEach(assignment => {
          if (Object.prototype.hasOwnProperty.call(values, assignment.variableId) && typeof assignment.value === "boolean") {
            values[assignment.variableId] = assignment.value;
          }
        });
      }
      activity.nodes.forEach(node => {
        text("h4", node.prompt, staticView);
        node.choices.forEach(choice => {
          const condition = choice.visibleWhen
            ? ` Shown when ${variables.find(variable => variable.id === choice.visibleWhen.variableId)?.label || "a variable"} is ${choice.visibleWhen.equals ? "true" : "false"}.`
            : "";
          const assignments = (choice.setVariables || []).map(assignment =>
            ` Set ${variables.find(variable => variable.id === assignment.variableId)?.label || "a variable"} to ${assignment.value ? "true" : "false"}.`
          ).join("");
          text("p", `${choice.label}: ${choice.feedback}${condition}${assignments} ${
            choice.nextNodeId ? "Continue to: " + (activity.nodes.find(n => n.id === choice.nextNodeId)?.prompt || "Missing destination") : "End of route."
          }`, staticView);
        });
      });
      let path = Array.isArray(saved.path) ? saved.path.slice(0, activity.nodes.length) : [];
      function render(focus = false) {
        content.replaceChildren();
        let current = activity.nodes.find(node => node.id === activity.startNodeId);
        const values = { ...initialValues };
        const requestedPath = path;
        const valid = [];
        for (const index of path) {
          const choice = Number.isInteger(index) && current?.choices[index];
          if (!choice || !isVisible(choice, values)) break;
          text("p", `${choice.label}: ${choice.feedback}`, content);
          valid.push(index);
          applyAssignments(choice, values);
          current = activity.nodes.find(node => node.id === choice.nextNodeId);
          if (!current) break;
        }
        path = valid;
        if (requestedPath.length !== valid.length || requestedPath.some((index, i) => index !== valid[i])) {
          update({ path });
        }
        if (current) {
          const prompt = text("h4", current.prompt, content);
          prompt.tabIndex = -1;
          current.choices.forEach((choice, index) => {
            if (!isVisible(choice, values)) return;
            control(content, choice.label, () => {
              path.push(index); update({ path }); render(true);
            });
          });
          if (focus) prompt.focus();
        } else {
          const end = text("p", "Route complete. Review the feedback or try another path.", content);
          end.tabIndex = -1;
          if (focus) end.focus();
        }
        control(content, "Restart scenario", () => { path = []; update({ path }); render(true); });
      }
      render();
    } else if (activity.kind === "hotspots") {
      text("p", activity.diagramDescription, content);
      const imageAsset = activity.imageAssetId && (
        options.imageAssets?.[activity.imageAssetId] || globalThis.__CHIMERA_ASSETS?.[activity.imageAssetId]
      );
      const imageSource = imageAsset?.src || imageAsset?.path;
      const board = text("div", "", content);
      board.className = `experience-hotspot-board${imageSource ? " has-image" : ""}`;
      board.setAttribute("role", "group");
      board.setAttribute("aria-label", activity.imageAssetId ? "Explore hotspots on the image" : "Explore diagram hotspots");
      const points = activity.hotspots;
      if (activity.imageAssetId && imageSource) {
        const image = text("img", "", board);
        image.src = imageSource;
        image.alt = "";
        image.setAttribute("aria-hidden", "true");
        image.addEventListener("error", () => announce("Diagram image could not be loaded. The text description and hotspot list remain available."));
        const printImage = text("img", "", staticView);
        printImage.src = imageSource;
        printImage.alt = "";
        printImage.addEventListener("error", () => printImage.remove());
        const credit = `Image credit: ${imageAsset.filename || "Project image"} — ${imageAsset.attributionText?.trim() || "Attribution not supplied."}`;
        text("p", credit, content).className = "experience-asset-credit";
        text("p", credit, staticView).className = "experience-asset-credit";
      } else if (activity.imageAssetId) {
        announce("Diagram image is unavailable. The text description and hotspot list remain available.");
      }
      text("p", activity.diagramDescription, staticView);
      points.forEach(point => {
        const detail = text("details", "", staticView);
        detail.open = true;
        text("summary", point.label, detail);
        text("p", point.explanation, detail);
      });
      const list = text("ol", "", content);
      list.className = "experience-hotspot-list";
      list.setAttribute("aria-label", "Hotspot descriptions in author order");
      const opened = new Set(Array.isArray(saved.opened) ? saved.opened.filter(id => points.some(p => p.id === id)) : []);
      points.forEach((point, index) => {
        const item = text("li", "", list);
        const detail = text("details", "", item);
        detail.open = opened.has(point.id);
        text("summary", `${index + 1}. ${point.label}`, detail);
        text("p", point.explanation, detail);
        detail.ontoggle = () => {
          if (detail.open) opened.add(point.id); else opened.delete(point.id);
          update({ opened: [...opened] });
        };
        const marker = control(board, String(index + 1), () => {
          detail.open = true;
          detail.querySelector("summary").focus();
        });
        marker.setAttribute("aria-label", `Explore ${point.label}`);
        marker.style.left = `${point.x}%`;
        marker.style.top = `${point.y}%`;
      });
    } else if (activity.kind === "sequencing") {
      text("p", activity.instruction, content);
      text("p", activity.instruction, staticView);
      const solution = text("ol", "", staticView);
      activity.items.forEach(item => text("li", item.label, solution));
      text("p", activity.feedback, staticView);
      const correct = activity.items.map(item => item.id);
      let order = Array.isArray(saved.order) && saved.order.length === correct.length
        && new Set(saved.order).size === correct.length && saved.order.every(id => correct.includes(id))
        ? [...saved.order] : [...correct].reverse();
      const list = text("ol", "", content);
      function render(focusId, direction) {
        list.replaceChildren();
        order.forEach((id, index) => {
          const item = text("li", "", list);
          text("span", activity.items.find(entry => entry.id === id).label, item);
          ["up", "down"].forEach(move => {
            const target = index + (move === "up" ? -1 : 1);
            const node = control(item, `Move ${activity.items.find(entry => entry.id === id).label} ${move}`, () => {
              [order[index], order[target]] = [order[target], order[index]];
              update({ order }); render(id, move);
              announce("Order changed. Check your sequence when ready.");
            });
            node.disabled = target < 0 || target >= order.length;
            if (focusId === id && direction === move) {
              // Keep keyboard focus on the moved item even at the boundary.
              if (!node.disabled) node.focus();
              else { item.tabIndex = -1; item.focus(); }
            }
          });
        });
      }
      render();
      control(content, "Check sequence", () => announce(order.every((id, i) => id === correct[i])
        ? `Correct sequence. ${activity.feedback}` : "Not yet. Reorder the items and try again, or open the worked solution."));
      control(content, "Reset sequence", () => {
        order = [...correct].reverse(); update({ order }); render(); announce("Sequence reset.");
      });
    } else if (activity.kind === "guided-practice") {
      activity.steps.forEach(step => {
        text("h4", step.prompt, staticView);
        text("p", `Hint: ${step.hint}`, staticView);
        step.choices.forEach(choice => text("p", `${choice.label}${choice.id === step.correctChoiceId ? " (correct)" : ""}: ${choice.feedback}`, staticView));
      });
      let answers = [];
      for (const answer of Array.isArray(saved.answers) ? saved.answers : []) {
        if (activity.steps[answers.length]?.correctChoiceId !== answer) break;
        answers.push(answer);
      }
      function render(focus = false) {
        content.replaceChildren();
        const step = activity.steps[answers.length];
        const heading = text("h4", step ? `Step ${answers.length + 1} of ${activity.steps.length}: ${step.prompt}` : "Practice complete.", content);
        heading.tabIndex = -1;
        if (focus) heading.focus();
        if (step) {
          const hint = text("details", "", content);
          text("summary", "Show hint", hint); text("p", step.hint, hint);
          step.choices.forEach(choice => control(content, choice.label, () => {
            if (choice.id === step.correctChoiceId) {
              answers.push(choice.id); update({ answers }); render(true);
              announce(`Correct. ${choice.feedback}`);
            } else announce(`Try again. ${choice.feedback}`);
          }));
        }
        control(content, "Restart practice", () => { answers = []; update({ answers }); render(true); });
      }
      render();
    } else if (activity.kind === "before-after") {
      const imageIds = [activity.before.imageAssetId, activity.after.imageAssetId];
      let reviewed = Array.isArray(saved.reviewedImages) && saved.reviewedImages.length === 2
        && saved.reviewedImages.every((id, index) => id === imageIds[index]);
      if (saved.reviewedImages !== undefined && !reviewed
        && !(Array.isArray(saved.reviewedImages) && saved.reviewedImages.length === 0)) update({ reviewedImages: [] });
      function showImage(parent, side) {
        const value = activity[side];
        const figure = text("figure", "", parent);
        text("h4", value.label, figure);
        const asset = options.imageAssets?.[value.imageAssetId] || globalThis.__CHIMERA_ASSETS?.[value.imageAssetId];
        const source = asset?.src || asset?.path;
        if (source) {
          const image = text("img", "", figure);
          image.src = source;
          image.alt = value.altText;
          image.className = "experience-comparison-image";
          image.addEventListener("error", () => {
            image.remove();
            text("p", `Image could not be loaded. ${value.altText}`, figure).setAttribute("role", "status");
          });
        } else text("p", `Image unavailable. ${value.altText}`, figure);
        text("figcaption", value.description, figure);
        text("p", `Image credit: ${asset?.filename || "Project image"} — ${asset?.attributionText?.trim() || "Attribution not supplied."}`, figure)
          .className = "experience-asset-credit";
      }
      text("p", activity.instruction, staticView);
      showImage(staticView, "before");
      showImage(staticView, "after");
      text("p", activity.explanation, staticView);
      text("p", activity.instruction, content);
      text("p", "Inspect both full images, then confirm your review. This is formative and does not affect grades or course completion.", content);
      const label = text("label", "Image to inspect ", content);
      const select = text("select", "", label);
      for (const side of ["before", "after"]) {
        const option = text("option", `${side === "before" ? "Before" : "After"}: ${activity[side].label}`, select);
        option.value = side;
      }
      const picture = text("div", "", content);
      function renderImage() { picture.replaceChildren(); showImage(picture, select.value); }
      select.onchange = renderImage;
      renderImage();
      text("p", activity.explanation, content);
      const status = text("p", "", content);
      status.setAttribute("role", "status");
      const showStatus = () => { status.textContent = reviewed ? "Comparison reviewed." : "Comparison not yet marked reviewed."; };
      showStatus();
      control(content, "Mark comparison reviewed", () => {
        reviewed = true;
        update({ reviewedImages: imageIds.slice() });
        showStatus();
      });
      control(content, "Restart comparison", () => {
        reviewed = false;
        select.value = "before";
        renderImage();
        update({ reviewedImages: [] });
        showStatus();
      });
    } else if (activity.kind === "software-walkthrough") {
      function screenshotFor(step) {
        return step.screenshotAssetId && (
          options.imageAssets?.[step.screenshotAssetId] || globalThis.__CHIMERA_ASSETS?.[step.screenshotAssetId]
        );
      }
      activity.steps.forEach((step, index) => {
        const detail = text("section", "", staticView);
        text("h4", `Step ${index + 1}: ${step.label}`, detail);
        const imageAsset = screenshotFor(step);
        const imageSource = imageAsset?.src || imageAsset?.path;
        if (imageSource) {
          const image = text("img", "", detail);
          image.src = imageSource;
          image.alt = step.screenshotAltText;
          image.className = "experience-walkthrough-screen";
          text("p", `Image credit: ${imageAsset.filename || "Project image"} — ${imageAsset.attributionText?.trim() || "Attribution not supplied."}`, detail)
            .className = "experience-asset-credit";
        } else {
          text("p", `Screenshot unavailable. ${step.screenshotAltText}`, detail);
        }
        text("p", step.description, detail);
        text("p", `Action: ${step.actionPrompt}`, detail);
      });
      const requested = Array.isArray(saved.completedSteps) ? saved.completedSteps : [];
      const completedSteps = [];
      for (let index = 0; index < requested.length && index < activity.steps.length; index++) {
        if (requested[index] !== activity.steps[index].id) break;
        completedSteps.push(requested[index]);
      }
      if (requested.length !== completedSteps.length
        || requested.some((stepId, index) => stepId !== completedSteps[index])) {
        update({ completedSteps });
      }
      let currentIndex = completedSteps.length;
      function render(focus = false) {
        content.replaceChildren();
        const step = activity.steps[currentIndex];
        const heading = text("h4", step
          ? `Step ${currentIndex + 1} of ${activity.steps.length}: ${step.label}`
          : "Walkthrough complete.", content);
        heading.tabIndex = -1;
        if (step) {
          const imageAsset = screenshotFor(step);
          const imageSource = imageAsset?.src || imageAsset?.path;
          if (imageSource) {
            const image = text("img", "", content);
            image.src = imageSource;
            image.alt = step.screenshotAltText;
            image.className = "experience-walkthrough-screen";
            image.addEventListener("error", () => {
              image.remove();
              announce("Screenshot could not be loaded. The text description and alternative text remain available.");
            });
            text("p", `Image credit: ${imageAsset.filename || "Project image"} — ${imageAsset.attributionText?.trim() || "Attribution not supplied."}`, content)
              .className = "experience-asset-credit";
          } else {
            text("p", `Screenshot unavailable. ${step.screenshotAltText}`, content);
          }
          text("p", step.description, content);
          text("p", `Action: ${step.actionPrompt}`, content);
        } else {
          text("p", "You confirmed every action in order. All walkthrough steps are complete.", content)
            .setAttribute("role", "status");
        }
        if (currentIndex > 0) control(content, "Previous step", () => {
          currentIndex--; render(true);
        });
        if (step && currentIndex < completedSteps.length) control(content, "Next step", () => {
          currentIndex++; render(true);
        });
        else if (step) control(content, "Mark action complete", () => {
          completedSteps.push(step.id);
          update({ completedSteps });
          currentIndex++;
          render(true);
        });
        control(content, "Restart walkthrough", () => {
          completedSteps.splice(0);
          currentIndex = 0;
          update({ completedSteps: [] });
          render(true);
        });
        if (focus) heading.focus();
      }
      render();
    }
  });
  text("p", experience.conclusion).className = "experience-conclusion";
  root.appendChild(section);
  const reduced = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const stop = () => animations.forEach(animation => animation.cancel());
  reduced?.addEventListener("change", stop);
  const print = () => section.querySelectorAll("details").forEach(node => { node.open = true; });
  globalThis.addEventListener("beforeprint", print);
  return () => {
    stop();
    section.querySelectorAll("details").forEach(node => { node.ontoggle = null; });
    reduced?.removeEventListener("change", stop);
    globalThis.removeEventListener("beforeprint", print);
    section.remove();
  };
}
