import json
import tempfile
import unittest
from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from backend.app import auth, main, storage
from backend.app.identity import LocalIdentityDirectory, Membership, OrganizationPolicy, ProjectMembership, UserRecord
from backend.app.models import ProjectCreate, SceneCreate
from backend.app.platform import LOCAL_ACTOR, action_context


class PlatformAccessTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.stack.enter_context(patch.multiple(storage, ROOT=self.root, PROJECTS=self.root / 'projects'))
        self.stack.enter_context(patch.object(main, 'ROOT', self.root))
        self.directory = LocalIdentityDirectory(self.root)
        self.directory.snapshot()
        self.actors = {name: LOCAL_ACTOR.model_copy(update={'actorId': name, 'actorDisplayName': name, 'deploymentMode': 'team'}) for name in ('author', 'reviewer', 'administrator', 'other', 'disabled')}
        with action_context(self.actors['author']):
            self.project = storage.create_project(ProjectCreate(title='Assigned project'))
            self.project = storage.create_scene(self.project.id, SceneCreate(title='Review this scene'))
        with action_context(self.actors['other']):
            self.other = storage.create_project(ProjectCreate(title='Other project'))
        snapshot = self.directory.snapshot()
        self.directory._write(snapshot.model_copy(update={
            'users': [UserRecord(id=name, displayName=f'Known {name}', status='disabled' if name == 'disabled' else 'active') for name in self.actors],
            'policy': OrganizationPolicy(deploymentMode='team', identityProvider='adapter', adminCanViewProjectContent=False),
            'memberships': [Membership(userId=name, teamId=LOCAL_ACTOR.installationId, role='author' if name == 'other' else name) for name in ('author', 'reviewer', 'administrator', 'other')],
            'projectMemberships': [ProjectMembership(projectId=self.project.id, userId='author', role='author'), ProjectMembership(projectId=self.project.id, userId='reviewer', role='reviewer')],
        }))
        adapter = Mock()
        def authenticate(request):
            name = request.headers.get('X-Test-Actor', 'author')
            if name not in self.actors:
                raise HTTPException(status_code=401, detail='Invalid test credential')
            actor = self.actors[name]
            if request.headers.get('X-Test-Installation'):
                actor = actor.model_copy(update={'installationId': request.headers['X-Test-Installation']})
            expires = datetime.now(timezone.utc) + timedelta(minutes=-1 if request.headers.get('X-Test-Expired') else 5)
            return auth.AuthenticatedSession(actor=actor, expiresAt=expires)
        adapter.authenticate.side_effect = authenticate
        auth.configure_session_adapter(adapter)
        self.addCleanup(auth.configure_session_adapter, None)
        self.client = self.stack.enter_context(TestClient(main.app))

    def get(self, path, actor='author', **headers):
        return self.client.get(path, headers={'X-Test-Actor': actor, **headers})

    def audit(self):
        return [json.loads(line) for line in (storage.project_path(self.project.id) / 'audit/events.jsonl').read_text(encoding='utf-8').splitlines()]

    def test_reviewer_can_comment_but_cannot_edit_export_or_approve(self):
        base = f'/api/projects/{self.project.id}'
        headers = {'X-Test-Actor': 'reviewer'}
        before = len(self.audit())
        self.assertEqual(self.client.post(base + '/scenes', headers=headers, json={'title': 'Denied'}).status_code, 403)
        for suffix in ('/storyboard.docx', '/backup.zip', '/scorm-12.zip', '/storyboard/export', '/scenes/fake/assessment.qti.xml'):
            self.assertEqual(self.get(base + suffix, 'reviewer').status_code, 403)
        self.assertEqual(self.client.post(base + '/enhancement-proposals/fake/decision', headers=headers, json={'decision': 'accept'}).status_code, 403)
        self.assertEqual(len(self.audit()), before)
        response = self.client.post(base + '/review-comments', headers=headers, json={'sceneId': self.project.storyboard.scenes[0].id, 'authorLabel': 'Untrusted display label', 'body': 'Please review'})
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(response.json()['actorId'], 'reviewer')
        events = self.audit()[before:]
        self.assertTrue(all(event['actorId'] == 'reviewer' for event in events))
        self.assertEqual(len({event['correlationId'] for event in events}), 1)
        self.assertTrue(all(event['actorDisplayName'] == 'Known reviewer' for event in events))

    def test_project_and_installation_isolation_filter_management_views(self):
        self.assertEqual(self.get(f'/api/projects/{self.other.id}').status_code, 403)
        self.assertEqual(self.get(f'/api/projects/{self.project.id}', **{'X-Test-Installation': 'foreign'}).status_code, 403)
        self.assertEqual([item['id'] for item in self.get('/api/projects').json()], [self.project.id])
        self.assertEqual([item['projectId'] for item in self.get('/api/management/project-health').json()], [self.project.id])
        self.assertEqual(self.get('/api/management/my-work').json()['actorId'], 'author')
        self.assertEqual(self.get('/api/identity/context', 'reviewer').json()['actor']['actorId'], 'reviewer')
        self.assertEqual(self.get('/api/management/audit', 'reviewer').status_code, 403)

    def test_metadata_only_admin_has_audit_and_membership_but_not_content(self):
        base = f'/api/projects/{self.project.id}'
        self.assertEqual(self.get(base, 'administrator').status_code, 403)
        self.assertEqual(self.get(base + '/storyboard.docx', 'administrator').status_code, 403)
        self.assertEqual(self.get('/api/management/project-health', 'administrator').status_code, 200)
        self.assertEqual(self.get('/api/management/audit', 'administrator').status_code, 200)
        response = self.client.post(base + '/members', headers={'X-Test-Actor': 'administrator'}, json={'userId': 'other', 'role': 'reviewer'})
        self.assertEqual(response.status_code, 201, response.text)
        event = self.audit()[-1]
        self.assertEqual(event['eventClass'], 'security')
        self.assertEqual(event['actorId'], 'administrator')

    def test_disabled_expired_and_unconfigured_sessions_fail_closed(self):
        self.assertEqual(self.get('/api/projects', 'disabled').status_code, 403)
        self.assertEqual(self.get('/api/projects', **{'X-Test-Expired': 'true'}).status_code, 401)
        for provider in ('oidc', 'saml', 'encarta'):
            self.directory.update_policy(OrganizationPolicy(deploymentMode='team', identityProvider=provider))
            self.assertEqual(self.get('/api/projects').status_code, 503)
        self.directory.update_policy(OrganizationPolicy(deploymentMode='team', identityProvider='local'))
        self.assertEqual(self.get('/api/projects').status_code, 503)
        self.directory.update_policy(OrganizationPolicy(deploymentMode='team', identityProvider='adapter'))
        auth.configure_session_adapter(None)
        self.assertEqual(self.get('/api/projects').status_code, 503)

    def test_export_audits_success_and_failed_requests_never_report_success(self):
        before = len(self.audit())
        response = self.get(f'/api/projects/{self.project.id}/storyboard.docx')
        self.assertEqual(response.status_code, 200)
        event = self.audit()[-1]
        self.assertEqual(event['metadata']['action'], 'project.export')
        self.assertEqual(event['actorId'], 'author')
        self.assertEqual(event['eventClass'], 'security')
        self.assertEqual(len(self.audit()), before + 1)
        self.assertEqual(self.get(f'/api/projects/{self.project.id}/assessment.qti.zip').status_code, 422)
        self.assertEqual(len(self.audit()), before + 1)

    def test_unmapped_routes_and_unknown_actions_deny_by_default(self):
        policy = main.get_authorization_policy()
        self.assertFalse(policy.allows(self.actors['administrator'], 'unknown'))
        for route in main.app.routes:
            if route.path.startswith('/api/'):
                self.assertIn(route.name, main.ROUTE_ACTIONS)

    def test_foreign_project_membership_does_not_grant_access(self):
        path = storage.project_path(self.other.id) / 'project.json'
        data = json.loads(path.read_text(encoding='utf-8'))
        data['installationId'] = 'foreign'
        path.write_text(json.dumps(data), encoding='utf-8')
        snapshot = self.directory.snapshot()
        self.directory._write(snapshot.model_copy(update={'projectMemberships': [*snapshot.projectMemberships, ProjectMembership(projectId=self.other.id, userId='author', role='author')]}))
        self.assertEqual(self.get(f'/api/projects/{self.other.id}').status_code, 403)
        self.assertNotIn(self.other.id, [item['id'] for item in self.get('/api/projects').json()])

    def test_backup_restore_preserves_live_audit_and_project_ownership(self):
        base = f'/api/projects/{self.project.id}'
        backup = self.get(base + '/backup.zip')
        self.assertEqual(backup.status_code, 200)
        response = self.client.post(base + '/review-comments', json={'sceneId': self.project.storyboard.scenes[0].id, 'authorLabel': 'Author', 'body': 'Later review'})
        self.assertEqual(response.status_code, 201)
        before = self.audit()
        restored = self.client.post(base + '/backup/restore', files={'file': ('backup.zip', backup.content, 'application/zip')})
        self.assertEqual(restored.status_code, 200, restored.text)
        after = self.audit()
        self.assertEqual(after[:len(before)], before)
        self.assertEqual(after[-1]['metadata']['action'], 'project.restore')
        metadata = json.loads((storage.project_path(self.project.id) / 'project.json').read_text(encoding='utf-8'))
        self.assertEqual(metadata['ownerId'], 'author')
        self.assertEqual(metadata['installationId'], LOCAL_ACTOR.installationId)

    def test_policy_change_is_attributed_and_audited_when_analytics_disabled(self):
        policy = self.directory.policy().model_copy(update={'trackingMode': 'disabled'})
        response = self.client.patch('/api/identity/policy', headers={'X-Test-Actor': 'administrator'}, json=policy.model_dump(mode='json'))
        self.assertEqual(response.status_code, 200, response.text)
        audit = json.loads((self.root / 'audit/events.jsonl').read_text(encoding='utf-8').splitlines()[-1])
        self.assertEqual(audit['actorId'], 'administrator')
        self.assertEqual(audit['eventClass'], 'security')
        self.assertEqual(audit['metadata']['action'], 'admin.policy.manage')


if __name__ == '__main__':
    unittest.main()
