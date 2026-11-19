import { useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, PanelLeftClose } from "lucide-react";
import "./workspace-navigation.css";

export function WorkspaceNavigation({ children }: { children: ReactNode }) {
  const [mobile, setMobile] = useState(() => matchMedia("(max-width: 760px)").matches);
  const [desktopOpen, setDesktopOpen] = useState(() => {
    try { return localStorage.getItem("chimera.navigation.collapsed") !== "true"; } catch { return true; }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const open = mobile ? drawerOpen : desktopOpen;

  useEffect(() => {
    const query = matchMedia("(max-width: 760px)");
    const changed = () => { setMobile(query.matches); setDrawerOpen(false); };
    query.addEventListener("change", changed);
    return () => query.removeEventListener("change", changed);
  }, []);

  useEffect(() => {
    if (!mobile || !drawerOpen) return;
    const main = root.current?.parentElement?.querySelector<HTMLElement>("#workspace-content");
    const previousOverflow = document.body.style.overflow;
    if (main) main.inert = true;
    document.body.style.overflow = "hidden";
    toggle.current?.focus();
    function keydown(event: KeyboardEvent) {
      // A dialog opened from the menu owns Escape and focus until it closes.
      if (document.querySelector('[role="dialog"], dialog[open]')) return;
      if (event.key === "Escape") { event.preventDefault(); setDrawerOpen(false); }
      if (event.key !== "Tab") return;
      const items = Array.from(root.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href]',
      ) ?? []).filter(item => item.getClientRects().length > 0 && !item.classList.contains("workspace-menu-backdrop"));
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      if (main) main.inert = false;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      toggle.current?.focus();
    };
  }, [mobile, drawerOpen]);

  function toggleMenu() {
    if (mobile) setDrawerOpen(value => !value);
    else setDesktopOpen(value => {
      try { localStorage.setItem("chimera.navigation.collapsed", String(value)); } catch { /* Navigation remains usable without storage. */ }
      return !value;
    });
  }

  return <div ref={root} className={`workspace-navigation ${open ? "menu-open" : "menu-closed"}`}>
    <button ref={toggle} type="button" className="workspace-menu-toggle" aria-label={open ? "Hide workspace menu" : "Show workspace menu"} aria-expanded={open} aria-controls="workspace-navigation" onClick={toggleMenu}>
      {open ? <PanelLeftClose size={20} /> : <Menu size={20} />}
    </button>
    {mobile && open && <button type="button" className="workspace-menu-backdrop" aria-label="Close workspace menu" tabIndex={-1} onClick={() => setDrawerOpen(false)} />}
    <aside id="workspace-navigation" className="sidebar" aria-label="Workspace navigation" inert={!open} aria-hidden={!open} onClick={event => {
      if (!mobile || !open) return;
      const action = (event.target as HTMLElement).closest<HTMLButtonElement | HTMLAnchorElement>("button, a");
      if (action && !action.hasAttribute("aria-expanded") && !action.hasAttribute("disabled")) setDrawerOpen(false);
    }}>{children}</aside>
  </div>;
}
