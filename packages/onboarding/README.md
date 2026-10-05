# Guided workflows onboarding

A framework-independent journey engine, DOM instruction card, and optional Playwright helpers. Chimera (React) and the standalone task demo (vanilla JavaScript) are separate adapters for the same package. There are no runtime dependencies.

This is a private, local 0.1 package. It has not been published, and its API may change during pilot use.

## Install and integrate

Install from a local checkout in another project:

```sh
npm install /path/to/chimera/packages/onboarding
```

For a portable, self-contained artifact, run `npm pack --workspace @guided-workflows/onboarding` from this repository and install the resulting tarball. The package exports native ESM; use a bundler to load its CSS. Framework wrappers are optional.

```js
import { createJourney } from '@guided-workflows/onboarding';
import { mountJourney } from '@guided-workflows/onboarding/dom';
import '@guided-workflows/onboarding/style.css';

const journey = {
  id: 'first-item', version: 1, title: 'Create your first item',
  steps: [
    {
      id: 'save', target: 'item.form', title: 'Save an item',
      instruction: 'Enter a title and choose Save.', event: 'item.saved',
      prerequisite: context => context.canCreate,
      unavailable: 'Choose a workspace with permission to create items.',
      accept: (event, context) => event.entityId === context.savedItemId,
    },
    {
      id: 'review', target: 'item.saved', title: 'Review your item',
      instruction: 'Check your saved item, then choose Next.',
    },
  ],
};

const controller = createJourney({
  journey,
  namespace: 'my-application.onboarding',
  scope: currentWorkspaceId,
  adapter: {
    context: () => ({ canCreate, savedItemId }),
    prepare: async (step, context, { signal }) => {
      // Open the relevant view using application callbacks. Preserve drafts.
      // Honor signal.aborted before any delayed navigation side effect.
      await openTask(step.id, { signal });
    },
  },
  storage: localStorage,
});
const unmount = mountJourney(controller);
startButton.addEventListener('click', () => controller.start());

// Only after the application confirms the save succeeded:
controller.signal({ type: 'item.saved', scope: currentWorkspaceId, entityId: savedItemId });

// On application teardown:
unmount();
controller.dispose();
```

The example names represent application-owned values/callbacks. The runnable integrations are [Chimera](../../frontend/src/onboarding.ts) and [the task demo](../../examples/onboarding-demo/src/main.js).

Add unique, visible anchors such as `<form data-onboarding="item.form">`. Runtime anchors are independent of accessible labels. The optional `resolveTarget(anchor)` renderer option supports alternative anchor systems. It must return an actual visible element, and anchor names should not identify multiple controls.

## Contract

| Operation | Behavior |
| --- | --- |
| `start()` | Enter or retry the current step; completed/finished journeys require an explicit restart. Never automatically launch on page load. |
| `start({ restart: true })` | Clear this scope's recorded steps and start again. It does not undo application data. |
| `signal({ type, scope, entityId })` | Advance an active action step only when scope, event type, and optional acceptance predicate match. |
| `next()` | Acknowledge an active informational step. It cannot bypass an action step. |
| `skip()` | Record an explicit skip. A journey with skips ends as `finished`, not `complete`. |
| `pause()` | Abort pending preparation, ignore subsequent success signals, and hide the guide while preserving application forms. |
| `block(message)` | Show recovery actions for a currently active/preparing step. |
| `setScope(scope)` | Save old progress and restore independent progress for another project/workspace. |
| `setScope(scope, { carry: true })` | Deliberately transfer progress when creating the first scope as part of the journey. Avoid this for ordinary project switches. |
| `subscribe(listener)` | Receive snapshots; returns an unsubscribe callback. |
| `dispose()` | Abort preparation and stop controller work. Unmount the renderer separately. |

`prepare` receives an AbortSignal when navigation is cancelled or times out. The engine prevents stale preparation from advancing a step; the application must honor that signal to prevent delayed application mutations. Preparation should navigate/open views, never perform the user's save or confirm deletion.

`prerequisite(context)` gates entry. `isComplete(context)` can reconcile a specific persisted application fact during resume; it must not infer review from the mere presence of content. Bump the journey version when step meaning/order changes. Restore validates saved step IDs and index, tolerates malformed/unavailable storage, and never silently resumes an active journey.

Progress keys combine namespace, encoded scope, and journey ID. Use separate namespaces for independent applications. Progress is browser-local practice history, not proof of current project readiness, authentication, or user training certification. Storage can be omitted; callers should catch exceptions when obtaining `localStorage` in restricted environments.

## DOM renderer

The renderer highlights targets with a CSS outline and uses a nonmodal instruction card. It places the card inside an existing `role="dialog" aria-modal="true"` when present, so the application's focus trap includes its controls. Escape pauses an active guide before it reaches the dialog's close handler. Give authors an in-dialog Resume action for paused walkthroughs, as Chimera does, so they can resume without discarding a draft.

Missing/hidden controls block after four seconds with Retry, Skip, and Pause actions. Disabled controls remain highlighted because they may legitimately await required form fields; no success is inferred from their visibility. Preparation and target-wait timeouts are separately configurable. The renderer preserves application interaction rather than applying a blocking spotlight overlay.

Call the returned unmount function on teardown. Only mount one renderer per active surface. This version supports one current modal and one active journey; concurrent stacked modals, iframe targets, Shadow DOM, cross-page navigation adapters, localized copy, cloud synchronization, analytics, and automatic journey generation are outside the verified scope. Use a custom presentation layer with `subscribe` if an application's modal system needs another mounting strategy.

Override the `--guide-surface`, `--guide-ink`, `--guide-accent`, and `--guide-progress` variables on `.onboarding-card` to match your design system. Validate contrast after overriding them.

Driver.js 1.9.0 was evaluated in the prototype. Its spotlight intercepted form actions and its Tab handler conflicted with the application's modal focus behavior; the verified implementation uses the simpler inline renderer. Another renderer can consume the same headless engine without changing journey definitions.

## Testing in another project

Install `@playwright/test` alongside the package. The optional toolkit exports semantic guide locators and step assertions:

```js
const { guide, expectStep } = require('@guided-workflows/onboarding/playwright');
await expectStep(page, 'Save an item');
await guide(page).getByRole('button', { name: 'Pause guide' }).click();
```

Application-specific fixtures and persisted-outcome assertions belong to the consuming project. Verify failed saves, wrong-scope events, pause/resume, missing targets, reload, project switches, keyboard interaction, and your modal lifecycle. Use `@axe-core/playwright` for automated accessibility checks and supplement them with manual screen-reader review.

Chimera exposes 48 task-specific journeys through Guided review, with independent progress by journey ID and project. Its application-owned registry is [onboarding-journeys.ts](../../frontend/src/onboarding-journeys.ts); the package itself contains no Chimera workflows.

Repository commands and verification evidence: [implementation record](../../docs/onboarding-implementation.md).
