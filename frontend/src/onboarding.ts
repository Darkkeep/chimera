import { createJourney, type Context, type Journey, type Step } from '@guided-workflows/onboarding';
import { mountJourney } from '@guided-workflows/onboarding/dom';
import '@guided-workflows/onboarding/style.css';
import './onboarding.css';

export const firstSceneJourney: Journey = {
  id: 'first-scene', version: 1, title: 'Your first saved scene',
  steps: [
    { id: 'project', target: 'project.name', title: 'Name your course', instruction: 'Enter a course name and choose Create project. This creates a real project in your local workspace.', event: 'project.created', isComplete: c => Boolean(c.projectId) },
    { id: 'scene', target: 'scene.form', title: 'Create a scene', instruction: 'Give the scene a title and on-screen text, then choose Create scene. Wait for the save to finish.', event: 'scene.created', prerequisite: c => Boolean(c.projectId), accept: (e, c) => c.savedSceneId === e.entityId },
    { id: 'review', target: 'scene.saved', title: 'Review your saved content', instruction: 'Your scene has been saved. Check its title and text in the workspace. Choose Next when you have reviewed it.' },
  ],
};

export function createChimeraOnboarding(context: () => Context, prepare: (step: Step) => void, journey: Journey = firstSceneJourney) {
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* The guide works without persistence. */ }
  const controller = createJourney({ journey, namespace: 'chimera.onboarding', scope: String(context().projectId || 'workspace'), storage,
    adapter: { context, prepare: step => prepare(step) } });
  return { controller, mount: () => mountJourney(controller) };
}
