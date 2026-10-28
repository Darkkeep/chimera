import { createJourney, type Context, type Journey, type Step } from '@guided-workflows/onboarding';
import { mountJourney } from '@guided-workflows/onboarding/dom';
import '@guided-workflows/onboarding/style.css';
import './onboarding.css';

export const firstSceneJourney: Journey = {
  id: 'first-scene', version: 1, title: 'Your first saved scene',
  steps: [
    { id: 'project', target: 'project.name', title: 'Name your course', instruction: 'Enter a course name. Optionally Attach documents for course design (PDF, DOCX, PPTX, TXT or Markdown, up to 25 MB each). Create project saves a real project and attaches selected references; it does not submit an AI run. Check any attachment errors afterwards.', event: 'project.created', isComplete: c => Boolean(c.projectId) },
    { id: 'scene', target: 'scene.form', title: 'Create a scene', instruction: 'Give the scene a title and on-screen text, then choose Create scene. Wait for the save to finish.', event: 'scene.created', prerequisite: c => Boolean(c.projectId), accept: (e, c) => c.savedSceneId === e.entityId },
    { id: 'review', target: 'scene.saved', title: 'Review your saved content', instruction: 'Your scene has been saved. Check its title and text in the workspace. Choose Next when you have reviewed it.' },
  ],
};

export function createChimeraOnboarding(context: () => Context, prepare: (step: Step) => void, journey: Journey = firstSceneJourney) {
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* The guide works without persistence. */ }
  const controller = createJourney({ journey, namespace: 'chimera.onboarding', scope: String(context().projectId || 'workspace'), storage,
    adapter: { context, prepare: step => prepare(step) } });
  return { controller, mount: (onDismiss?: () => void) => {
    const unmount = mountJourney(controller);
    const unsubscribe = controller.subscribe(state => {
      if (!['active', 'preparing', 'blocked'].includes(state.status)) return;
      const actions = document.querySelector('.onboarding-card .onboarding-actions');
      if (!actions) return;
      const dismiss = document.createElement('button');
      dismiss.type = 'button';
      dismiss.textContent = 'Dismiss walkthrough';
      dismiss.addEventListener('click', () => { controller.pause(); onDismiss?.(); });
      actions.append(dismiss);
    });
    return () => { unsubscribe(); unmount(); };
  } };
}
