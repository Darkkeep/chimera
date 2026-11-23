import { useEffect, useLayoutEffect, useId, useRef, useState } from "react";
import type { ReactNode, PointerEvent } from "react";
import { ChevronDown, ChevronUp, Dock, GripHorizontal, Pin, X } from "lucide-react";
import "./floating-inspector.css";

export function FloatingInspector({ title, children, footer, onClose, pinned = false, onPin, index = 0, reset = 0 }: { title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; pinned?: boolean; onPin?: () => void; index?: number; reset?: number }) {
  const id = useId(), ref = useRef<HTMLElement>(null), restore = useRef<HTMLElement | null>(null);
  const key = `chimera.inspector.${title}`;
  const [position, setPosition] = useState<{x:number;y:number} | null>(() => { try { const raw = JSON.parse(localStorage.getItem(key) || "null"); return raw && Number.isFinite(raw.x) && Number.isFinite(raw.y) ? raw : null; } catch { return null; } });
  const [,setViewportVersion] = useState(0);
  useEffect(()=>{const resize=()=>setViewportVersion(value=>value+1);window.addEventListener("resize",resize);return()=>window.removeEventListener("resize",resize);},[]);
  const [collapsed, setCollapsed] = useState(false), [docked, setDocked] = useState(false);
  function persist(next: {x:number;y:number} | null) { setPosition(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* The inspector remains movable. */ } }
  useEffect(() => { if (reset) { persist(null); setDocked(false); setCollapsed(false); } }, [reset]);
  useLayoutEffect(() => {
    restore.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = ref.current;
    const trigger = restore.current?.closest(".editor-dropdown")?.querySelector<HTMLElement>("[data-menu-trigger]");
    if(trigger)restore.current=trigger;
    node?.focus();
    return () => { if (node?.contains(document.activeElement) && restore.current?.isConnected) restore.current.focus(); };
  }, []);
  const x = position ? Math.max(8, Math.min(position.x, innerWidth - Math.min(320, innerWidth - 16) - 8)) : undefined;
  const y = position ? Math.max(8, Math.min(position.y, innerHeight - 80)) : undefined;
  function drag(event: PointerEvent<HTMLButtonElement>) {
    if (innerWidth <= 760 || docked) return;
    const rect = ref.current!.getBoundingClientRect(), startX = event.clientX, startY = event.clientY, node = event.currentTarget;
    node.setPointerCapture(event.pointerId);
    function move(e: globalThis.PointerEvent) { setPosition({ x: Math.max(8, Math.min(innerWidth - rect.width - 8, rect.x + e.clientX - startX)), y: Math.max(8, Math.min(innerHeight - 80, rect.y + e.clientY - startY)) }); }
    function finish(e: globalThis.PointerEvent) { move(e); const bounds = ref.current!.getBoundingClientRect(); persist({x:bounds.x,y:bounds.y}); node.removeEventListener("pointermove",move); node.removeEventListener("pointerup",finish); node.removeEventListener("pointercancel",cancel); }
    function cancel() { persist({x:rect.x,y:rect.y}); node.removeEventListener("pointermove",move); node.removeEventListener("pointerup",finish); node.removeEventListener("pointercancel",cancel); }
    node.addEventListener("pointermove",move); node.addEventListener("pointerup",finish); node.addEventListener("pointercancel",cancel);
  }
  return <aside ref={ref} role="dialog" aria-modal="false" aria-labelledby={`${id}-title`} tabIndex={-1} className={`floating-inspector ${docked ? "is-docked" : ""}`} data-inspector={title} style={{left:docked ? undefined : x,top:docked ? undefined : y ?? 120 + index * 35,right:docked || x === undefined ? 14 + index * 24 : undefined,maxHeight:docked?undefined:`calc(100dvh - ${y ?? 120 + index * 35}px - 8px)`,zIndex:30 + index}} onKeyDown={event => {
    if (event.key === "Escape" && !(event.target as HTMLElement).closest('[popover]')) { event.stopPropagation(); event.preventDefault(); onClose(); }
  }}>
    <header className="floating-inspector-header">
      <button type="button" className="inspector-grip" aria-label={`Move ${title} inspector`} title="Drag to move; arrow keys move 10 pixels" onPointerDown={drag} onKeyDown={event => {
        if (!event.key.startsWith("Arrow") || docked) return; event.preventDefault(); const rect = ref.current!.getBoundingClientRect(); const delta = event.shiftKey ? 40 : 10;
        persist({ x: Math.max(8, Math.min(innerWidth - rect.width - 8, rect.x + (event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0))), y:Math.max(8,Math.min(innerHeight - 80,rect.y + (event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0))) });
      }}><GripHorizontal size={14}/></button>
      <h3 id={`${id}-title`}>{title}</h3>
      {onPin && <button type="button" aria-label={`Pin ${title} inspector`} aria-pressed={pinned} title="Keep this inspector open" onClick={onPin}><Pin size={13}/></button>}
      <button type="button" aria-label={`Dock ${title} inspector`} aria-pressed={docked} title="Dock at right edge" onClick={() => setDocked(!docked)}><Dock size={13}/></button>
      <button type="button" aria-label={`Collapse ${title} inspector`} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}</button>
      <button type="button" aria-label="Close scene controls" title={`Close ${title}`} onClick={onClose}><X size={14}/></button>
    </header>
    {!collapsed && <div className="floating-inspector-body">{children}</div>}
    {!collapsed && footer && <div className="floating-inspector-footer">{footer}</div>}
  </aside>;
}
