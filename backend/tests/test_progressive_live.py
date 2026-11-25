import json
import os
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from unittest.mock import patch
from fastapi import HTTPException
from backend.app import storage, progressive_authoring as progressive, progressive_live as live
from backend.app.models import ProjectCreate,SceneUpdate
from backend.app.platform import LOCAL_ACTOR
from backend.app.pythia_hosted import digest

class LiveHandoffTests(unittest.TestCase):
    def setUp(self):
        self.root=Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.enterContext(patch.object(storage,'ROOT',self.root));self.enterContext(patch.object(storage,'PROJECTS',self.root/'projects'))
        self.project=storage.create_project(ProjectCreate(title='P01 controlled course'))
        self.actor=LOCAL_ACTOR.actorId;self.job=progressive.submit(self.project.id,self.project.storyboard.revision,self.actor)
        units=[dict(label='Page 17',text='Inspect equipment before use. Report visible damage immediately.')]
        self.source=dict(source_id='source-a',original_sha256='a'*64,text_sha256=digest(units),units=units)
        self.document=dict(format='pythia-chimera-progressive-v1',handoffId='11111111-1111-4111-8111-111111111111',
            actorId=self.actor,sourceActor='pythia-alice',projectId=self.project.id,consultationId='consultation-a',
            inputSha256='b'*64,status='running',sources=[self.source],findings=[])
        self.connection=live.Connection(handoffId=self.document['handoffId'],handoffToken='synthetic-private-grant-token-123456789')
        live.save_connection(self.project.id,self.job['jobId'],self.actor,self.connection)
    def finding(self,quote,content):
        binding=dict(consultation_id='consultation-a',actor_id='pythia-alice',source_id='source-a',original_sha256='a'*64,
            text_sha256=self.source['text_sha256'],unit_label='Page 17',quote=quote,content=content)
        return dict(format='pythia-showcase-finding-v2',**binding,finding_id=digest(binding),revision=1,status='provisional',coverage='Source-bound inference.',limitations=['Review required.'])
    def ingest(self):live.ingest(self.project.id,self.job['jobId'],self.actor,self.document,lambda:None)
    def test_accept_edit_continue_replay_and_recovery(self):
        first=self.finding('Inspect equipment before use.','Consider a pre-use checklist.')
        self.document['findings']=[first];self.ingest()
        component=first['finding_id'][:24];initial=self.project.storyboard.revision
        self.assertEqual(storage.read_project(self.project.id).storyboard.revision,initial)
        accepted=progressive.decide(self.project.id,self.job['jobId'],component,self.actor,'accept',initial)
        edited=storage.update_scene(self.project.id,accepted.storyboard.scenes[0].id,SceneUpdate(title='Author-owned correction'),accepted.storyboard.revision)
        second=self.finding('Report visible damage immediately.','Provide a clear reporting path.')
        self.document['findings'].append(second);self.ingest();self.ingest()
        self.assertEqual(len(progressive.page(self.project.id,self.job['jobId'],self.actor)['events']),4)
        self.assertEqual(storage.read_project(self.project.id).storyboard.scenes[0].title,'Author-owned correction')
        with self.assertRaises(storage.StoryboardRevisionConflict):progressive.decide(self.project.id,self.job['jobId'],second['finding_id'][:24],self.actor,'accept',accepted.storyboard.revision)
        final=progressive.decide(self.project.id,self.job['jobId'],second['finding_id'][:24],self.actor,'accept',edited.storyboard.revision)
        self.assertEqual(len(final.storyboard.scenes),2)
        with patch.object(progressive,'RUN_ID','restarted'),patch.dict(os.environ,{'CHIMERA_PROGRESSIVE_DEMO':'true'}):progressive.recover()
        self.assertEqual(progressive.page(self.project.id,self.job['jobId'],self.actor)['status'],'running')
        self.assertEqual(live.existing_connection(self.project.id,self.actor,self.connection)['jobId'],self.job['jobId'])
        self.assertNotIn(self.connection.handoffToken,json.dumps(progressive.page(self.project.id,self.job['jobId'],self.actor)))
        self.assertFalse((storage.project_path(self.project.id)/'progressive-links').exists())
    def test_citation_binding_and_foreign_actor_fail_closed(self):
        good=self.finding('Inspect equipment before use.','Use a checklist.')
        for change in [lambda f:f.update(quote='Fabricated quote'),lambda f:f.update(actor_id='other'),lambda f:f.update(original_sha256='0'*64),lambda f:f.update(consultation_id='other')]:
            bad=deepcopy(good);change(bad);binding={k:v for k,v in bad.items() if k not in {'format','finding_id','revision','status','coverage','limitations'}};bad['finding_id']=digest(binding);self.document['findings']=[bad]
            with self.assertRaises(ValueError):self.ingest()
        self.assertEqual(len(storage.read_project(self.project.id).storyboard.scenes),0)
        with self.assertRaises(HTTPException):progressive.page(self.project.id,self.job['jobId'],'other-author')
    def test_revoked_target_permission_prevents_each_delivery(self):
        self.document['findings']=[self.finding('Inspect equipment before use.','Use a checklist.')]
        def denied():raise HTTPException(403,'Revoked')
        with self.assertRaises(HTTPException):live.ingest(self.project.id,self.job['jobId'],self.actor,self.document,denied)
        self.assertEqual(len(progressive.page(self.project.id,self.job['jobId'],self.actor)['events']),1)
    def test_changed_consultation_identity_and_conflicting_finding_are_rejected(self):
        self.document['findings']=[self.finding('Inspect equipment before use.','Use a checklist.')];self.ingest()
        self.document['inputSha256']='c'*64
        with self.assertRaises(HTTPException):self.ingest()
