import copy
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import httpx
import base64

from backend.app import enhancement_jobs as jobs, main, pythia_hosted as hosted, pythia_talk as talk, storage
from backend.app.models import EnhancementJobCreate, EnhancementProposalCreate, ProjectCreate, SceneCreate
from backend.app.platform import LOCAL_ACTOR, action_context
from backend.tests import test_pythia_actions as action_fixtures
from backend.tests.test_pythia_hosted import HOSTED_ENV, LIMITS


SCENE = {'title': 'Use the agreed design', 'extractedText': ['Practise one meaningful task.']}


class HostedStoryboardingTests(unittest.TestCase):
    def setUp(self):
        self.root = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.multiple(storage, ROOT=self.root, PROJECTS=self.root / 'projects'))
        self.enterContext(patch.object(main, 'ROOT', self.root))
        self.enterContext(patch.dict(os.environ, HOSTED_ENV))
        self.enterContext(patch.object(hosted, 'account_roles', return_value={'author'}))
        self.project = storage.create_project(ProjectCreate(title='External agreed brief'))

    def test_empty_storyboard_drafts_pending_scenes_and_only_explicit_accept_applies(self):
        job = storage.create_enhancement_job(self.project.id, EnhancementJobCreate(scope='whole-course', goal='Storyboard the agreed design'))
        output = {'proposals': [{'changes': [{'targetSceneId': None, 'field': 'additionalScenes', 'proposedValue': [SCENE]}],
                    'rationale': 'Create the first learner-sized scene.', 'referenceCitations': []}], 'resourceConflicts': []}
        with patch.object(hosted, 'author', return_value=output) as provider:
            jobs._run_job(self.project.id, job.id)
        self.assertEqual(storage.read_project(self.project.id).storyboard.scenes, [])
        completed = storage.read_enhancement_job(self.project.id, job.id)
        self.assertEqual(completed.status, 'completed', completed.error)
        self.assertEqual(completed.actorId, LOCAL_ACTOR.actorId)
        self.assertEqual(provider.call_args.args[4], job.id)
        proposal = storage.list_enhancement_proposals(self.project.id)[0]
        _, accepted = storage.decide_enhancement_proposal(self.project.id, proposal.id, 'accept', self.project.storyboard.revision)
        self.assertEqual([scene.title for scene in accepted.storyboard.scenes], ['Use the agreed design'])
        _, reversed_project = storage.decide_enhancement_proposal(self.project.id, proposal.id, 'reverse', accepted.storyboard.revision)
        self.assertEqual(reversed_project.storyboard.scenes, [])

    def test_initial_scene_proposal_cannot_append_globally_to_nonempty_storyboard(self):
        project = storage.create_scene(self.project.id, SceneCreate(title='Existing', extractedText=['Keep this']))
        with self.assertRaisesRegex(ValueError, 'anchor'):
            storage.create_enhancement_proposal(project.id, EnhancementProposalCreate(changes=[
                {'targetSceneId': None, 'field': 'additionalScenes', 'proposedValue': [SCENE]}], rationale='Unsafe global addition'))

    def test_hosted_preview_discovers_without_generation_and_rejects_tools_honestly(self):
        metadata = {'consultationLimits': LIMITS, 'capabilities': {}, 'authoring': {'contentDrafts': True, 'storyboardEnhancements': True}}
        with patch.object(hosted, '_capabilities', return_value=metadata), patch.object(hosted, 'author') as model:
            preview = jobs.preview_enhancement_submission(self.project.id, EnhancementJobCreate(scope='whole-course', goal='Storyboard this'))
            self.assertTrue(preview['engineConfigured'])
            self.assertEqual(preview['sceneCount'], 0)
            tools = jobs.preview_enhancement_submission(self.project.id, EnhancementJobCreate(scope='whole-course', goal='Storyboard this', useTools=True))
            self.assertFalse(tools['engineConfigured'])
            self.assertIn('Turn off specialist', tools['unavailableReason'])
            model.assert_not_called()

    def test_transport_signs_actor_project_revision_and_verifies_result_hash(self):
        seen = []
        document = None
        result = {'proposals': [], 'resourceConflicts': []}
        config = hosted.configuration()
        def reply(request):
            nonlocal document
            seen.append(request)
            if request.method == 'POST':
                document = json.loads(request.content)
            header, encoded, signature = request.headers['X-Pythia-Authoring-Access'].split('.')
            config.key.public_key().verify(base64.urlsafe_b64decode(signature + '=='), (header + '.' + encoded).encode())
            claims = json.loads(base64.urlsafe_b64decode(encoded + '=='))
            self.assertEqual(claims['aud'], 'pythia-authoring')
            self.assertEqual(claims['project_id'], self.project.id)
            self.assertEqual(claims['source_revision'], self.project.storyboard.revision)
            return httpx.Response(202 if request.method == 'POST' else 200, json={
                'operation_id': 'operation-one', 'request_sha256': hosted.authoring_digest(document),
                'status': 'accepted' if request.method == 'POST' else 'completed',
                'result': None if request.method == 'POST' else result,
                'result_sha256': hosted.authoring_digest(result), 'error_code': None})
        real_client = httpx.Client
        with patch.object(hosted, '_capabilities', return_value={'authoring': {'storyboardEnhancements': True}}), \
                patch.object(hosted.httpx, 'Client', side_effect=lambda **kw: real_client(transport=httpx.MockTransport(reply), **kw)), patch.object(hosted.time, 'sleep'):
            answer = hosted.author(config, LOCAL_ACTOR, self.project.id, self.project.storyboard.revision, 'request-one', 'enhancement', {'goal': 'Draft'})
        self.assertEqual(answer, result)
        self.assertEqual(len(seen), 2)
        self.assertEqual(document['scope']['actor_id'], LOCAL_ACTOR.actorId)

    def test_current_access_checks_project_membership_job_owner_and_revision(self):
        job = storage.create_enhancement_job(self.project.id, EnhancementJobCreate(scope='whole-course', goal='Storyboard'))
        claims = {'aud': 'pythia-authoring', 'scope': hosted.conversation_scope(hosted.configuration(), LOCAL_ACTOR.actorId, 'session'),
                  'project_id': self.project.id, 'source_revision': self.project.storyboard.revision, 'request_id': job.id,
                  'kind': 'enhancement', 'action': 'draft:submit'}
        self.assertTrue(hosted.turn_access_allowed(claims))
        with patch.object(main, 'get_authorization_policy', return_value=Mock(allows=Mock(return_value=False))):
            self.assertFalse(hosted.turn_access_allowed(claims))
        storage.update_enhancement_job(self.project.id, job.id, actorId='another-author')
        self.assertFalse(hosted.turn_access_allowed(claims))
        storage.update_enhancement_job(self.project.id, job.id, actorId=LOCAL_ACTOR.actorId)
        storage.create_scene(self.project.id, SceneCreate(title='Changed', extractedText=['New revision']))
        self.assertFalse(hosted.turn_access_allowed(claims))

    def test_recovery_does_not_reissue_hosted_drafts(self):
        job = storage.create_enhancement_job(self.project.id, EnhancementJobCreate(scope='whole-course', goal='Storyboard'))
        with patch.object(jobs, 'start_enhancement_job') as dispatch:
            jobs.recover_enhancement_jobs()
        dispatch.assert_not_called()
        self.assertEqual(storage.read_enhancement_job(self.project.id, job.id).status, 'failed')

    def test_builtin_hosted_account_membership_is_rechecked(self):
        from backend.app.password_auth import AccountStore
        from backend.app.identity import ProjectMembership
        with patch.dict(os.environ, {'CHIMERA_DEPLOYMENT_PROFILE': 'networked', 'CHIMERA_PUBLIC_ORIGIN': 'https://chimera.example.test'}):
            accounts = AccountStore(self.root)
            actor_id = accounts.provision('fictional-author@example.test', 'Fictional long test password 123', 'Fictional Author', ['author'])
            actor = LOCAL_ACTOR.model_copy(update={'actorId': actor_id, 'installationId': 'https://chimera.example.test', 'deploymentMode': 'team'})
            with action_context(actor):
                project = storage.create_project(ProjectCreate(title='Hosted account project'))
                accounts.add_project_membership(ProjectMembership(projectId=project.id, userId=actor_id, role='author'))
                job = storage.create_enhancement_job(project.id, EnhancementJobCreate(scope='whole-course', goal='Storyboard'))
            claims = {'aud': 'pythia-authoring', 'scope': hosted.conversation_scope(hosted.configuration(), actor_id, 'session'),
                      'project_id': project.id, 'source_revision': project.storyboard.revision, 'request_id': job.id,
                      'kind': 'enhancement', 'action': 'draft:submit'}
            self.assertTrue(hosted.turn_access_allowed(claims))
            accounts.remove_membership(project.id, actor_id)
            self.assertFalse(hosted.turn_access_allowed(claims))


class HostedContentDraftTests(unittest.TestCase):
    def test_consultation_draft_bypasses_desktop_and_preserves_review_before_apply(self):
        fixture = action_fixtures.PythiaActionTests('test_update_is_previewed_then_applied_once_with_authored_text_sync')
        fixture.setUp()
        self.addCleanup(fixture.doCleanups)
        with patch.dict(os.environ, HOSTED_ENV), patch.object(hosted, 'account_roles', return_value={'author'}), \
                patch.object(hosted, 'limits', return_value=LIMITS), \
                patch.object(hosted, 'author', return_value=copy.deepcopy(action_fixtures.UPDATE)) as provider, \
                patch.object(talk, 'local_mcp') as desktop:
            self.assertEqual(fixture.draft().status_code, 202)
            state = fixture.finished()
            self.assertEqual(state['actions'][0]['status'], 'pending')
            self.assertEqual(storage.read_project(fixture.project.id).storyboard.scenes[0].title, 'Original')
            desktop.assert_not_called()
            self.assertIn('New operators', provider.call_args.args[6]['designBrief'])
            self.assertEqual(fixture.decide().status_code, 200)
            self.assertEqual(storage.read_project(fixture.project.id).storyboard.scenes[0].title, 'Inspect before use')
