// Shared by authoring, delivery, and document snapshots. Native geometry only.
export function shapeMarkup(element) {
  const a = element.appearance || {};
  const w = element.width,
    h = element.height,
    inset = (a.strokeWidth || 0) / 2;
  const attrs = `fill="${a.fill || "#168da8"}" fill-opacity="${a.fillOpacity ?? 1}" stroke="${a.stroke || "#202020"}" stroke-opacity="${a.strokeOpacity ?? 1}" stroke-width="${a.strokeWidth || 0}"`;
  let geometry;
  switch (element.nativeShape) {
    case "ellipse":
      geometry = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${Math.max(0, w / 2 - inset)}" ry="${Math.max(0, h / 2 - inset)}"/>`;
      break;
    case "triangle":
      geometry = `<polygon points="${w / 2},${inset} ${w - inset},${h - inset} ${inset},${h - inset}"/>`;
      break;
    case "diamond":
      geometry = `<polygon points="${w / 2},${inset} ${w - inset},${h / 2} ${w / 2},${h - inset} ${inset},${h / 2}"/>`;
      break;
    case "arrow":
      geometry = `<polygon points="0,${h * 0.3} ${w * 0.65},${h * 0.3} ${w * 0.65},0 ${w},${h / 2} ${w * 0.65},${h} ${w * 0.65},${h * 0.7} 0,${h * 0.7}"/>`;
      break;
    case "line":
      geometry = `<path d="M ${inset} ${h / 2} H ${w - inset}" fill="none" stroke="${a.stroke || a.fill || "#202020"}" stroke-opacity="${a.strokeOpacity ?? 1}" stroke-width="${a.strokeWidth || 2}"/>`;
      break;
    default:
      geometry = `<rect x="${inset}" y="${inset}" width="${Math.max(0, w - 2 * inset)}" height="${Math.max(0, h - 2 * inset)}" rx="${element.nativeShape === "rounded-rectangle" ? Math.min(a.cornerRadius ?? 12, w / 2, h / 2) : 0}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g ${attrs}>${geometry}</g></svg>`;
}

export function appearanceStyle(element) {
  const a = element.appearance;
  if (!a) return {};
  const filters = [];
  // Silhouette-based raised/recessed lighting approximation, including glyph edges.
  for (const [name, reverse] of [
    ["bevel", false],
    ["emboss", true],
  ]) {
    const e = a[name];
    if (!e?.enabled) continue;
    const angle = (e.angle * Math.PI) / 180;
    const x = Math.cos(angle) * e.size * (reverse ? -1 : 1);
    const y = Math.sin(angle) * e.size * (reverse ? -1 : 1);
    filters.push(
      `drop-shadow(${-x}px ${-y}px ${e.blur / 2}px rgba(255,255,255,${e.opacity}))`,
      `drop-shadow(${x}px ${y}px ${e.blur / 2}px ${e.color}${Math.round(
        e.opacity * 255,
      )
        .toString(16)
        .padStart(2, "0")})`,
    );
  }
  if (a.shadow?.enabled) {
    const e = a.shadow,
      angle = (e.angle * Math.PI) / 180;
    filters.push(
      `drop-shadow(${Math.cos(angle) * e.size}px ${Math.sin(angle) * e.size}px ${e.blur}px ${e.color}${Math.round(
        e.opacity * 255,
      )
        .toString(16)
        .padStart(2, "0")})`,
    );
  }
  return {
    opacity: a.opacity,
    filter: filters.length ? filters.join(" ") : "none",
  };
}
