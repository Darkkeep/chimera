import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from backend.app import main, media, storage
from backend.app.models import AssetMetadataUpdate, ProjectCreate


class MediaAliasTests(unittest.TestCase):
    def setUp(self):
        temporary=tempfile.TemporaryDirectory();self.addCleanup(temporary.cleanup)
        root=Path(temporary.name)
        self.enterContext(patch.multiple(storage,ROOT=root,PROJECTS=root/'projects'))
        self.enterContext(patch.object(main,'ROOT',root))
        self.client=self.enterContext(TestClient(main.app))
        self.project=storage.create_project(ProjectCreate(title='Synthetic media alias'))
        self.project=storage.add_project_asset(self.project.id,'original.mp4',b'\x00\x00\x00\x18ftypisom\x00\x00\x00\x00','video')
        self.asset=self.project.storyboard.assets[-1]
        self.url=f'/api/projects/{self.project.id}/assets/{self.asset.id}/metadata'

    def patch_name(self,name,revision=None):
        return self.client.patch(self.url,headers={'If-Match':f'"{revision or self.project.storyboard.revision}"'},json={'displayName':name})

    def test_alias_preserves_file_identity_and_accessibility_metadata(self):
        self.project=media.update_metadata(self.project.id,self.asset.id,AssetMetadataUpdate(transcript='Original transcript',captionsVtt='WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nCaption.',language='fr'),self.project.storyboard.revision)
        original=self.project.storyboard.assets[-1].model_dump()
        response=self.patch_name('  Demonstration video  ');self.assertEqual(response.status_code,200,response.text)
        saved=storage.read_project(self.project.id).storyboard.assets[-1].model_dump()
        self.assertEqual(saved.pop('displayName'),'Demonstration video');original.pop('displayName');self.assertEqual(saved,original)
        reloaded=storage.read_project(self.project.id);self.assertEqual(reloaded.storyboard.assets[-1].displayName,'Demonstration video')

    def test_revision_guard_validation_and_clear(self):
        revision=self.project.storyboard.revision
        self.assertEqual(self.client.patch(self.url,json={'displayName':'Needs a revision'}).status_code,428)
        for value in [None,42,'x'*201]:self.assertEqual(self.patch_name(value).status_code,422)
        response=self.patch_name('Alias');self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(self.patch_name('Stale',revision).status_code,412)
        self.project=storage.read_project(self.project.id);response=self.patch_name('   ');self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['storyboard']['assets'][-1]['displayName'],'');self.assertEqual(response.json()['storyboard']['assets'][-1]['filename'],'original.mp4')

    def test_legacy_metadata_save_does_not_remove_alias(self):
        response=self.patch_name('Named video');self.assertEqual(response.status_code,200,response.text)
        project=storage.read_project(self.project.id)
        project=media.update_metadata(project.id,self.asset.id,AssetMetadataUpdate(transcript='Updated'),project.storyboard.revision)
        self.assertEqual(project.storyboard.assets[-1].displayName,'Named video');self.assertEqual(project.storyboard.assets[-1].transcript,'Updated')
