/** Headless journey engine. No framework, DOM, or application imports. */
export function createJourney({ journey, adapter, storage, namespace, scope, timeout = 4000 }) {
  if (!journey.steps.length || new Set(journey.steps.map(s => s.id)).size !== journey.steps.length) {
    throw new Error('A journey needs nonempty, uniquely identified steps.');
  }
  const listeners = new Set();
  let generation = 0;
  let navigation;
  let disposed = false;
  let state = { status: 'idle', index: 0, scope, message: '', completed: [], skipped: [] };
  const key = () => `${namespace}:${encodeURIComponent(state.scope)}:${journey.id}`;
  const snapshot = () => ({ ...state, completed: [...state.completed], skipped: [...state.skipped], step: journey.steps[state.index], total: journey.steps.length, title: journey.title });
  function publish() {
    try { storage?.setItem(key(), JSON.stringify({ version: journey.version, ...state })); } catch { /* In-memory operation remains available. */ }
    for (const listener of listeners) listener(snapshot());
  }
  function restore() {
    try {
      const saved = JSON.parse(storage?.getItem(key()) ?? 'null');
      const ids = new Set(journey.steps.map(s => s.id));
      if (saved?.version === journey.version && Number.isInteger(saved.index) && saved.index >= 0 && saved.index < journey.steps.length &&
          Array.isArray(saved.completed) && saved.completed.every(id => ids.has(id)) && Array.isArray(saved.skipped) && saved.skipped.every(id => ids.has(id))) {
        state = { ...state, index: saved.index, completed: saved.completed, skipped: saved.skipped,
          status: ['complete', 'finished'].includes(saved.status) ? saved.status : 'paused', message: '' };
      }
    } catch { /* Malformed or unavailable storage starts fresh. */ }
  }
  restore();
  async function enter() {
    const token = ++generation;
    navigation?.abort();
    const pending = new AbortController(); navigation = pending;
    let navigationTimer;
    state.status = 'preparing'; state.message = ''; publish();
    const step = journey.steps[state.index];
    try {
      const context = adapter.context();
      if (step.prerequisite && !step.prerequisite(context)) throw new Error(step.unavailable ?? 'Complete the prerequisite before continuing.');
      // Resume reconciles persisted facts, not generic DOM visibility or clicks.
      if (step.isComplete?.(context)) { advance(false); return; }
      await Promise.race([
        Promise.resolve(adapter.prepare?.(step, context, { signal: pending.signal })),
        new Promise((_, reject) => pending.signal.addEventListener('abort', () => reject(new Error('Navigation cancelled.')), { once: true })),
        new Promise((_, reject) => { navigationTimer = setTimeout(() => reject(new Error('The task could not be opened. Retry when the application is ready.')), timeout); }),
      ]);
      if (disposed || token !== generation) return;
      state.status = 'active'; publish();
    } catch (error) {
      if (disposed || token !== generation) return;
      pending.abort();
      state.status = 'blocked'; state.message = error instanceof Error ? error.message : 'The task could not be opened.'; publish();
    } finally { clearTimeout(navigationTimer); if (navigation === pending) navigation = undefined; }
  }
  function advance(skipped) {
    const list = skipped ? state.skipped : state.completed;
    const id = journey.steps[state.index].id;
    if (!list.includes(id)) list.push(id);
    ++generation;
    navigation?.abort();
    if (state.index === journey.steps.length - 1) {
      state.status = state.skipped.length ? 'finished' : 'complete'; state.message = ''; publish();
    } else { state.index++; void enter(); }
  }
  return {
    snapshot,
    subscribe(listener) { if (disposed) return () => {}; listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener); },
    start({ restart = false } = {}) {
      if (disposed) return;
      if (restart) state = { ...state, index: 0, completed: [], skipped: [], message: '' };
      if (!['complete', 'finished'].includes(state.status) || restart) void enter();
    },
    signal(event) {
      if (disposed || state.status !== 'active' || event.scope !== state.scope) return;
      const step = journey.steps[state.index];
      if (step.event === event.type && (!step.accept || step.accept(event, adapter.context()))) advance(false);
    },
    next() { if (!disposed && state.status === 'active' && !journey.steps[state.index].event) advance(false); },
    skip() { if (!disposed && ['active', 'blocked'].includes(state.status)) advance(true); },
    block(message) { if (!disposed && ['active', 'preparing'].includes(state.status)) { ++generation; navigation?.abort(); state.status = 'blocked'; state.message = message; publish(); } },
    pause() { if (!disposed && ['active', 'preparing', 'blocked'].includes(state.status)) { ++generation; navigation?.abort(); state.status = 'paused'; state.message = ''; publish(); } },
    setScope(nextScope, { carry = false } = {}) {
      if (disposed || nextScope === state.scope) return;
      ++generation;
      navigation?.abort();
      const previous = { ...state };
      if (['active', 'preparing', 'blocked'].includes(state.status)) state.status = 'paused';
      publish();
      state = { status: 'idle', index: 0, scope: nextScope, message: '', completed: [], skipped: [] };
      if (carry) { state = { ...previous, scope: nextScope }; publish(); }
      else { restore(); publish(); }
    },
    dispose() { ++generation; navigation?.abort(); disposed = true; listeners.clear(); },
  };
}
