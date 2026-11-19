import { useEffect, useRef, useState } from "react";
import "./editor-dropdown.css";

export type EditorCommand = { label: string; action: () => void; disabled?: boolean };

export function EditorDropdown({ label, commands, disabled = false }: { label: string; commands: EditorCommand[]; disabled?: boolean }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const pointerOpened = useRef(false);
  const hoverOpened = useRef(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const node = popup.current;
    const changed = () => setOpen(Boolean(node?.matches(":popover-open")));
    node?.addEventListener("toggle", changed);
    const dismiss = () => { if (node?.matches(":popover-open")) node.hidePopover(); };
    window.addEventListener("resize", dismiss);
    return () => { node?.removeEventListener("toggle", changed); window.removeEventListener("resize", dismiss); };
  }, []);
  function show() {
    const button = trigger.current, node = popup.current;
    if (!button || !node || disabled) return;
    if (node.matches(":popover-open")) { node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); return; }
    const rect = button.getBoundingClientRect();
    const width = Math.min(250, innerWidth - 16);
    node.style.width = `${width}px`;
    node.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - width - 8))}px`;
    node.style.top = `${Math.min(rect.bottom + 3, innerHeight - 100)}px`;
    node.style.maxHeight = `${Math.max(80, innerHeight - Math.min(rect.bottom + 3, innerHeight - 100) - 8)}px`;
    node.showPopover();
    node.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }
  return <span className="editor-dropdown">
    <button ref={trigger} type="button" data-menu-trigger aria-haspopup="menu" aria-expanded={open} disabled={disabled} onPointerDown={() => { pointerOpened.current = Boolean(popup.current?.matches(":popover-open")) && !hoverOpened.current; hoverOpened.current = false; }} onClick={() => {
      if (pointerOpened.current) { popup.current?.hidePopover(); pointerOpened.current = false; }
      else show();
    }} onPointerEnter={() => {
      const bar = trigger.current?.closest('[data-scene-menubar]');
      if (bar?.querySelector('.editor-menu-popup:popover-open') && !popup.current?.matches(':popover-open')) { show(); hoverOpened.current = true; }
    }} onKeyDown={event => {
      if (event.key === "ArrowDown") { event.preventDefault(); event.stopPropagation(); show(); }
    }}>{label}</button>
    <div ref={popup} popover="auto" role="menu" aria-label={`${label} menu`} className="editor-menu-popup" onKeyDown={event => {
      event.stopPropagation();
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
        items[next]?.focus();
      }
      if (event.key === "Escape") { event.preventDefault(); popup.current?.hidePopover(); trigger.current?.focus(); }
      if (event.key === "Tab") popup.current?.hidePopover();
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        const triggers = Array.from(trigger.current?.closest('[data-scene-menubar]')?.querySelectorAll<HTMLButtonElement>('[data-menu-trigger]:not(:disabled)') ?? []);
        const current = triggers.indexOf(trigger.current!);
        popup.current?.hidePopover();
        const next = triggers[(current + (event.key === "ArrowRight" ? 1 : triggers.length - 1)) % triggers.length];
        if (next) { next.focus(); next.click(); } else trigger.current?.focus();
      }
    }}>
      {commands.map(command => <button type="button" role="menuitem" key={command.label} disabled={command.disabled} onClick={() => { popup.current?.hidePopover(); command.action(); }}>{command.label}</button>)}
    </div>
  </span>;
}

export function PreviewMenu({ onScene, onExperience, disabled = false }: { onScene: () => void; onExperience: () => void; disabled?: boolean }) {
  return <EditorDropdown label="Preview" disabled={disabled} commands={[
    { label: "This scene", action: onScene },
    { label: "Whole experience", action: onExperience },
  ]} />;
}
