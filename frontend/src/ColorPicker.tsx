import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./color-picker.css";

const PaletteContext = createContext<{ colors: string[]; saved: string[]; save: (color: string) => void }>({ colors: [], saved: [], save: () => {} });
export function normalizeColor(value: string) {
  const raw = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(raw)) return `#${[...raw.slice(1)].map(c => c + c).join("")}`;
  return /^#[0-9a-f]{6}$/.test(raw) ? raw : null;
}
export function projectColors(value: unknown): string[] {
  const colors = new Set<string>();
  function visit(item: unknown) {
    if (!item || typeof item !== "object") return;
    for (const [key, val] of Object.entries(item)) {
      if (typeof val === "string" && /^(color|backgroundColor|fill|stroke|background|foreground|accent|accentText|diagramAccent)$/.test(key)) {
        const color = normalizeColor(val); if (color) colors.add(color);
      } else if (val && typeof val === "object") visit(val);
    }
  }
  visit(value); return [...colors];
}
export function ProjectPalette({ projectId, value, children }: { projectId: string; value: unknown; children: ReactNode }) {
  const key = `chimera.swatches.${projectId}`;
  const [saved, setSaved] = useState<string[]>(() => {
    try { const raw: unknown = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(raw) ? [...new Set(raw.filter((c): c is string => typeof c === "string").map(normalizeColor).filter((c): c is string => Boolean(c)))].slice(0, 32) : []; } catch { return []; }
  });
  useEffect(() => { function sync() { try { const raw: unknown=JSON.parse(localStorage.getItem(key)||"[]");if(Array.isArray(raw))setSaved([...new Set(raw.filter((c):c is string=>typeof c==="string").map(normalizeColor).filter((c):c is string=>Boolean(c)))].slice(-32)); }catch{/* Keep working session swatches. */} } window.addEventListener("chimera:swatches",sync);window.addEventListener("storage",sync);return()=>{window.removeEventListener("chimera:swatches",sync);window.removeEventListener("storage",sync);}; },[key]);
  const colors = useMemo(() => projectColors(value), [value]);
  function save(color: string) {
    const next=[...new Set([...saved,color])].slice(-32);setSaved(next);try {localStorage.setItem(key,JSON.stringify(next));window.dispatchEvent(new Event("chimera:swatches"));} catch {/* Swatches still work for this session. */}
  }
  return <PaletteContext.Provider value={{ colors, saved, save }}>{children}</PaletteContext.Provider>;
}
const standards = ["#ffffff", "#e5e7eb", "#6b7280", "#202020", "#000000", "#ef4444", "#f97316", "#eab308", "#22c55e", "#168da8", "#3b82f6", "#8542e8", "#ff32aa", "#100818"];
export function ColorPicker({ label, value, onChange, disabled = false }: { label: string; value: string; onChange: (color: string) => void; disabled?: boolean }) {
  const palette = useContext(PaletteContext), id = useId();
  const popup = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<string | null>(null), [invalid, setInvalid] = useState(false), [open, setOpen] = useState(false);
  function choose(color: string) { setDraft(null); setInvalid(false); onChange(color); }
  function finish() { if (draft === null) return; const color = normalizeColor(draft); if (color) choose(color); else setInvalid(true); }
  function group(title: string, colors: string[]) { return colors.length ? <div className="color-swatch-group"><strong>{title}</strong><div role="group" aria-label={title}>{colors.map(color => <button key={color} type="button" className="color-swatch" aria-label={`${title} ${color}`} aria-pressed={normalizeColor(value) === color} title={color} style={{ backgroundColor: color }} disabled={disabled} onClick={() => choose(color)}/>)}</div></div> : null; }
  return <div className="project-color-picker">
    <span id={`${id}-label`}>{label.replace(/^Studio /, "")}</span>
    <button type="button" ref={trigger} className="color-picker-trigger" aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => {
      const node = popup.current, button = trigger.current; if (!node || !button) return;
      if (node.matches(":popover-open")) { node.hidePopover(); return; }
      const rect = button.getBoundingClientRect(), width = Math.min(272, innerWidth - 16);
      node.style.width = `${width}px`; node.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
      node.style.top = `${Math.max(8, Math.min(rect.bottom + 4, innerHeight - 420))}px`;
      node.showPopover(); node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }}><span className="color-current" style={{backgroundColor:value}} aria-hidden="true"/><span id={`${id}-value`}>{value}</span></button>
    <div ref={popup} popover="auto" className="project-color-popup" role="dialog" aria-label={`${label} picker`} onToggle={event => setOpen((event.target as HTMLElement).matches(":popover-open"))} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === "Escape") { event.preventDefault(); popup.current?.hidePopover(); trigger.current?.focus(); }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('.color-swatch')); const index = items.indexOf(document.activeElement as HTMLButtonElement); if (index >= 0) { event.preventDefault(); items[(index + (event.key === "ArrowRight" ? 1 : items.length - 1)) % items.length]?.focus(); } }
    }}>
      <div className="color-picker-heading"><strong>{label.replace(/^Studio /, "")}</strong><button type="button" aria-label="Close color picker" onClick={() => { popup.current?.hidePopover(); trigger.current?.focus(); }}>×</button></div>
      {group("Course colors", palette.colors)}{group("Saved swatches", palette.saved)}{group("Standard colors", standards)}
      <div className="color-custom"><label>Custom color<input type="color" aria-label={label} value={normalizeColor(value) || "#000000"} disabled={disabled} onChange={event => choose(event.target.value)}/></label><label>Hex<input aria-label={`${label} hex`} value={draft ?? value} aria-invalid={invalid || undefined} maxLength={7} disabled={disabled} onChange={event => { setDraft(event.target.value); setInvalid(false); }} onBlur={finish} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); finish(); } }}/></label></div>
      {invalid && <p role="alert">Use a hex color such as #168da8.</p>}
      <button type="button" className="save-color-swatch" disabled={disabled || palette.saved.includes(normalizeColor(value) || value)} onClick={() => palette.save(normalizeColor(value) || value)}>Save current color as swatch</button>
      <small>Saved for this course in this browser.</small>
    </div>
  </div>;
}
