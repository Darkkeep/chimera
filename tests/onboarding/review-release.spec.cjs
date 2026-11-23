const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');

// No model/provider calls; each test creates disposable real course files.
test('human review decisions bind approved SCORM export to the exact revision', async ({ request }) => {
  const title = 'Review release ' + crypto.randomUUID();
  let project = await (await request.post('/api/projects', { data: { title } })).json();
  let created = await request.post(`/api/projects/${project.id}/scenes`, {
    data: { title: 'Prepare the sandwich', extractedText: ['Spread each slice.'],
      actionDescription: 'Apply a little peanut butter.' },
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
  });
  expect(created.ok(), await created.text()).toBe(true);
  project = await created.json();
  const sceneId = project.storyboard.scenes[0].id;

  const fresh = await (await request.get(`/api/projects/${project.id}/review-approval`)).json();
  expect(fresh.approved).toBe(false);
  expect(fresh.state).toBe('not-reviewed');
  let release = await request.get(`/api/projects/${project.id}/scorm-12.zip?approved=true`);
  expect(release.status()).toBe(409);

  const comment = await request.post(`/api/projects/${project.id}/review-comments`, {
    data: { sceneId, authorLabel: 'Independent reviewer', body: 'Make the instruction clearer.' },
  });
  expect(comment.ok(), await comment.text()).toBe(true);
  const commentId = (await comment.json()).id;
  const decision = (decision, note, revision = project.storyboard.revision) =>
    request.post(`/api/projects/${project.id}/review-approval`, {
      data: { decision, note, expectedRevision: revision },
    });
  expect((await decision('approve', 'Approval is premature')).status()).toBe(409);
  expect((await decision('request-changes', 'Clarify the sandwich technique')).ok()).toBe(true);
  const resolved = await request.post(`/api/projects/${project.id}/review-comments/${commentId}/decision`, {
    data: { resolved: true },
  });
  expect(resolved.ok(), await resolved.text()).toBe(true);
  const accepted = await decision('approve', 'Reviewed revised explanation and confirmed interaction intent.');
  expect(accepted.ok(), await accepted.text()).toBe(true);
  const approved = await accepted.json();
  expect(approved.approved).toBe(true);
  expect(approved.revision).toBe(project.storyboard.revision);
  release = await request.get(`/api/projects/${project.id}/scorm-12.zip?approved=true`);
  expect(release.ok(), await release.text()).toBe(true);
  const zip = await release.body();
  expect(zip.subarray(0, 2).toString()).toBe('PK');

  const second = await request.post(`/api/projects/${project.id}/scenes`, {
    data: { title: 'Check the sandwich', extractedText: ['Is the filling spread evenly?'] },
    headers: { 'If-Match': `"${project.storyboard.revision}"` },
  });
  expect(second.ok(), await second.text()).toBe(true);
  const current = await (await request.get(`/api/projects/${project.id}/review-approval`)).json();
  expect(current.approved).toBe(false);
  expect(current.state).toBe('changed-since-review');
  expect((await request.get(`/api/projects/${project.id}/scorm-12.zip?approved=true`)).status()).toBe(409);
  expect((await decision('approve', 'Stale approval', project.storyboard.revision)).status()).toBe(412);

  const separate = await (await request.post('/api/projects', { data: { title: 'Unrelated Sporting Merit ' + crypto.randomUUID() } })).json();
  expect((await request.get(`/api/projects/${separate.id}/scorm-12.zip?approved=true`)).status()).toBe(409);
});
