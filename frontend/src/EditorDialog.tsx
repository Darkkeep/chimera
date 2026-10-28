import { ReactNode, useEffect, useRef } from "react";

/** Shared keyboard and focus behavior for the authoring dialogs. */
export function EditorDialog({ children, labelledBy, onClose, busy = false, className = "", onResumeWalkthrough, walkthroughLabel = "Resume walkthrough", onboardingTarget, onboardingJourney }: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
  busy?: boolean;
  className?: string;
  onResumeWalkthrough?: () => void;
  walkthroughLabel?: string;
  onboardingTarget?: string;
  onboardingJourney?: string;
}) {
  const dialog = useRef<HTMLElement>(null);
  const latest = useRef({ onClose, busy });
  latest.current = { onClose, busy };

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
    ) ?? []).filter((element) => element.getClientRects().length > 0);
    const initial = dialog.current?.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled)");
    (initial ?? focusable()[0] ?? dialog.current)?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!latest.current.busy) latest.current.onClose();
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) {
        event.preventDefault();
        dialog.current?.focus();
      } else if (event.shiftKey && (document.activeElement === first || !elements.includes(document.activeElement as HTMLElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !elements.includes(document.activeElement as HTMLElement))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  return <div className="modal-backdrop" onClick={(event) => {
    if (event.target === event.currentTarget && !busy) onClose();
  }}>
    <section ref={dialog} data-onboarding={onboardingTarget} data-onboarding-journey={onboardingJourney} className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
      {children}
      {onResumeWalkthrough && <button type="button" className="button button-outline" onClick={onResumeWalkthrough} disabled={busy}>{walkthroughLabel}</button>}
    </section>
  </div>;
}
