import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

export function AssessmentFeedbackDialog({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    const node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
      const feedbackButton = document.querySelector<HTMLButtonElement>('.course-preview-shell [data-view-feedback]');
      if (feedbackButton) feedbackButton.focus();
      else if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return createPortal(<dialog ref={dialog} className="assessment-feedback-dialog" aria-labelledby="assessment-feedback-title" onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); onClose(); } }} onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}>
    {children}
    <button type="button" autoFocus onClick={onClose}>Close feedback</button>
  </dialog>, document.body);
}