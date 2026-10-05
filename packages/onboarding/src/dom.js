/** A nonmodal instruction card, moved inside application dialogs when needed. */
export function mountJourney(controller, { root = document.body, resolveTarget, timeout = 4000 } = {}) {
  const panel = document.createElement('section');
  panel.className = 'onboarding-card'; panel.setAttribute('aria-label', 'Interactive guide');
  panel.setAttribute('role', 'region'); panel.tabIndex = -1;
  const progress = document.createElement('p'); progress.className = 'onboarding-progress';
  const heading = document.createElement('h2');
  const copy = document.createElement('p');
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const actions = document.createElement('div'); actions.className = 'onboarding-actions';
  panel.append(progress, heading, copy, status, actions);
  let currentTarget, previousFocus, focusCaptured = false, deadline = 0, disposed = false, dismissed = false, opened = false;
  function clearHighlight() { currentTarget?.removeAttribute('data-onboarding-highlight'); currentTarget = undefined; }
  function restoreFocus() {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (dialog && !dialog.contains(previousFocus)) {
      if (!dialog.contains(document.activeElement)) dialog.querySelector('input, textarea, button')?.focus();
    } else if (previousFocus?.isConnected) previousFocus.focus();
  }
  function button(label, action) { const el = document.createElement('button'); el.type = 'button'; el.textContent = label; el.addEventListener('click', action); actions.append(el); }
  function placePanel() {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    const host = dialog ?? root;
    if (panel.parentElement !== host) {
      if (dialog) host.prepend(panel);
      else host.append(panel);
    }
  }
  function render(state) {
    clearHighlight(); actions.replaceChildren();
    if (['active', 'preparing', 'blocked'].includes(state.status)) opened = true;
    const visible = ['active', 'preparing', 'blocked'].includes(state.status) || (opened && ['complete', 'finished'].includes(state.status));
    dismissed = !visible;
    if (!visible) { opened = false; panel.remove(); if (focusCaptured) restoreFocus(); focusCaptured = false; return; }
    if (!focusCaptured) { previousFocus = document.activeElement; focusCaptured = true; }
    placePanel();
    progress.textContent = `${state.title} · ${Math.min(state.index + 1, state.total)} / ${state.total}`;
    heading.textContent = state.status === 'complete' ? 'Walkthrough complete' : state.status === 'finished' ? 'Walkthrough ended' : state.step.title;
    copy.textContent = ['complete', 'finished'].includes(state.status) ? state.skipped.length ? `${state.skipped.length} step(s) skipped. Restart to practice the full workflow.` : 'Your actions were confirmed. You can restart this walkthrough whenever you need it.' : state.step.instruction;
    status.textContent = state.status === 'blocked' ? state.message : state.status === 'preparing' ? 'Opening the task…' : state.status === 'active' && state.step.event ? 'Continue in the application. This step advances after success.' : '';
    if (state.status === 'blocked') button('Retry', () => controller.start());
    if (state.status === 'active' && !state.step.event) button('Next', () => controller.next());
    if (['active', 'blocked'].includes(state.status)) button('Skip step', () => controller.skip());
    if (['complete', 'finished'].includes(state.status)) {
      button('Restart', () => controller.start({ restart: true }));
      button('Close guide', () => { dismissed = true; panel.remove(); clearHighlight(); restoreFocus(); focusCaptured = false; });
    } else button('Pause guide', () => controller.pause());
    if (state.step.helpUrl) { const link = document.createElement('a'); link.href = state.step.helpUrl; link.textContent = 'Read instructions'; link.target = '_blank'; link.rel = 'noopener'; actions.append(link); }
    deadline = Date.now() + timeout;
    locate();
  }
  function locate() {
    const state = controller.snapshot();
    if (disposed || dismissed) return;
    placePanel();
    if (state.status !== 'active' || !state.step.target) return;
    const target = resolveTarget?.(state.step.target) ?? [...document.querySelectorAll('[data-onboarding]')].find(el => el.getAttribute('data-onboarding') === state.step.target);
    if (target?.isConnected && target.getClientRects().length && !target.closest('[hidden], [inert]')) {
      if (currentTarget !== target) {
        clearHighlight(); currentTarget = target; target.setAttribute('data-onboarding-highlight', '');
        target.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      }
      deadline = Date.now() + timeout;
    } else {
      clearHighlight();
      if (Date.now() >= deadline) controller.block('The control is unavailable. Retry, skip this step, or pause the guide. Your form data is preserved.');
    }
  }
  const unsubscribe = controller.subscribe(render);
  const timer = setInterval(locate, 150);
  function escape(event) {
    if (event.key === 'Escape' && ['active', 'preparing', 'blocked'].includes(controller.snapshot().status)) {
      event.preventDefault(); event.stopImmediatePropagation(); controller.pause();
    }
  }
  document.addEventListener('keydown', escape, true);
  return () => { disposed = true; clearInterval(timer); unsubscribe(); document.removeEventListener('keydown', escape, true); clearHighlight(); panel.remove(); };
}
