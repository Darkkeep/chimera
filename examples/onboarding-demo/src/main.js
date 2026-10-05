import { createJourney } from '@guided-workflows/onboarding';
import { mountJourney } from '@guided-workflows/onboarding/dom';
import '@guided-workflows/onboarding/style.css';
import './demo.css';

let storage;
try { storage = localStorage; } catch { /* Keep an in-memory application available. */ }
let tasks = [];
try { const stored = JSON.parse(storage?.getItem('task-demo.items') ?? '[]'); if (Array.isArray(stored)) tasks = stored.filter(t => typeof t.id === 'string' && typeof t.title === 'string'); } catch { /* Start with an empty task list. */ }
let selectedId;
const context = () => ({ selectedId, hasTask: Boolean(tasks.find(t => t.id === selectedId)) });
const journey = { id: 'first-task', version: 1, title: 'Your first completed task', steps: [
  { id: 'create', title: 'Create a task', target: 'task.create', instruction: 'Give your task a title, then choose Create task.', event: 'task.created' },
  { id: 'edit', title: 'Refine the title', target: 'task.edit', instruction: 'Change the title of your new task and save the change.', event: 'task.updated', prerequisite: c => c.hasTask, accept: (event, c) => event.entityId === c.selectedId },
  { id: 'finish', title: 'Mark it complete', target: 'task.finish', instruction: 'Choose Mark complete for your task. Completion is recognized after the change is saved.', event: 'task.completed', prerequisite: c => c.hasTask, accept: (event, c) => event.entityId === c.selectedId },
] };
try { selectedId = storage?.getItem('task-demo.selected') || undefined; } catch { /* No persistence. */ }
const controller = createJourney({ journey, namespace: 'task-demo.onboarding', scope: 'personal', storage, adapter: { context, prepare() { render(); } } });
const unmount = mountJourney(controller, { root: document.querySelector('#guide-rail') });
window.addEventListener('pagehide', () => { unmount(); controller.dispose(); });
function save(next, type, entityId) {
  try {
    // A successful local write is the application's confirmation contract.
    if (!storage) throw new Error('Browser storage is unavailable. Enable it to save tasks.');
    storage.setItem('task-demo.items', JSON.stringify(next));
    tasks = next; selectedId = entityId;
    storage.setItem('task-demo.selected', entityId);
    render(); controller.signal({ type, scope: 'personal', entityId });
    document.querySelector('#notice').textContent = 'Saved in this browser.';
    return true;
  } catch (error) { document.querySelector('#notice').textContent = `Could not save: ${error.message}`; return false; }
}
document.querySelector('#task-form').addEventListener('submit', event => {
  event.preventDefault(); const title = document.querySelector('#task-title').value.trim(); if (!title) return;
  const task = { id: crypto.randomUUID(), title, description: document.querySelector('#description').value, done: false };
  if (save([...tasks, task], 'task.created', task.id)) event.target.reset();
});
document.querySelector('#start-guide').addEventListener('click', () => controller.start({ restart: ['complete', 'finished'].includes(controller.snapshot().status) }));
function render() {
  const list = document.querySelector('#task-list'); list.replaceChildren();
  if (!tasks.length) { list.textContent = 'No tasks yet. Start with one small action.'; return; }
  for (const task of tasks) {
    const row = document.createElement('article'); row.className = 'task-row';
    const title = document.createElement('h3'); title.textContent = task.title;
    const details = document.createElement('p'); details.textContent = task.description;
    const form = document.createElement('form'); if (task.id === selectedId) form.dataset.onboarding = 'task.edit';
    const input = document.createElement('input'); input.value = task.title; input.required = true; input.setAttribute('aria-label', `Edit title for ${task.title}`);
    const submit = document.createElement('button'); submit.textContent = 'Save title'; submit.type = 'submit';
    form.append(input, submit); form.addEventListener('submit', event => { event.preventDefault(); if (input.value.trim()) save(tasks.map(t => t.id === task.id ? { ...t, title: input.value.trim() } : t), 'task.updated', task.id); });
    const finish = document.createElement('button'); finish.type = 'button'; finish.textContent = task.done ? 'Completed' : 'Mark complete'; finish.disabled = task.done;
    if (task.id === selectedId) finish.dataset.onboarding = 'task.finish';
    finish.addEventListener('click', () => save(tasks.map(t => t.id === task.id ? { ...t, done: true } : t), 'task.completed', task.id));
    row.append(title, details, form, finish); list.append(row);
  }
}
render();
