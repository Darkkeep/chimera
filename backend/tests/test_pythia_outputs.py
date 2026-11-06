import base64
import hashlib
import os
import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch
from pydantic import ValidationError

from backend.app import content_generation, pythia_media, storage
from backend.app.models import MediaGenerationJobCreate, SceneContentDraft
from backend.tests import test_content_generation as scene_fixtures


class PythiaOutputTests(unittest.TestCase):
    def setUp(self):
        self.client = Mock()
        self.client.media_status.return_value = {'configured':True,'revision':'revision1','models':{'scene':'scene-model','narration':'audio-model'}}
        self.enterContext(patch.object(pythia_media,'PythiaProvider',return_value=self.client))
        self.job = SimpleNamespace(id='test-job-123', script='AI-generated narration.', voice='alloy', prompt='Rolling ball', width=1280, height=720, durationSeconds=4,projectId='project')
    def result(self, data, model, media):
        return {'format':'pythia-media-result-v1','request_id':self.job.id,'model':model,'media_type':media,'sha256':hashlib.sha256(data).hexdigest(),'data_base64':base64.b64encode(data).decode(),'status':'completed'}
    def test_narration_uses_pythia_and_checks_return(self):
        self.client.generate_narration.return_value=self.result(b'ID3audio','audio-model','audio/mpeg')
        provider=pythia_media.PythiaMediaProvider('narration','pythia-media-revision1')
        self.assertEqual(provider.generate_narration(self.job),(b'ID3audio','audio/mpeg','audio-model'))
        self.client.generate_narration.assert_called_once_with({'request_id':self.job.id,'expected_revision':'revision1','script':self.job.script,'voice':'alloy'})
        self.client.generate_narration.return_value['sha256']='wrong'
        with self.assertRaises(RuntimeError): provider.generate_narration(self.job)
    def test_retired_video_provider_does_not_generate(self):
        with self.assertRaisesRegex(RuntimeError, 'unavailable'):
            pythia_media.PythiaMediaProvider('video')
        self.client.start_video.assert_not_called()
    def test_scene_prompt_uses_pythia_without_chimera_credentials(self):
        with patch.object(pythia_media,'enabled',return_value=True),patch.object(pythia_media,'draft_scene',return_value={'title':'Draft'}) as draft,patch.object(content_generation,'resolve_connection',side_effect=AssertionError('No direct credential lookup')):
            result=content_generation._generate_json({'targetScene':{}},'Guidance')
        self.assertEqual(result,{'title':'Draft'})
        self.assertIn('Guidance',draft.call_args.args[1])
    def test_native_animated_diagram_is_accepted_but_svg_and_assets_are_rejected(self):
        draft=scene_fixtures.SceneDraftContractTests().draft(['Safety checklist','Inspect equipment before operation.'])
        shape={'id':'diagram','kind':'shape','nativeShape':'ellipse','x':80,'y':450,'width':120,'height':120,'animations':{'entrance':{'effect':'fade','durationMs':400}}}
        draft['visualLayout']['elements'].append(shape)
        parsed=SceneContentDraft.model_validate(draft)
        self.assertEqual(parsed.visualLayout.elements[-1].nativeShape,'ellipse')
        for fields in ({'shapeSvg':'<svg></svg>'},{'assetId':'invented'},{'kind':'image'}):
            with self.subTest(fields=fields):
                draft['visualLayout']['elements'][-1]={**shape,**fields}
                with self.assertRaises(ValidationError): SceneContentDraft.model_validate(draft)
    def test_audio_job_pins_pythia_without_direct_key_and_video_is_rejected(self):
        project=SimpleNamespace(storyboard=SimpleNamespace(scenes=[SimpleNamespace(id='scene')],revision=1))
        with patch.dict(os.environ,{'CHIMERA_IMAGE_PROVIDER':'pythia'}),patch.object(storage,'read_project',return_value=project),patch.object(storage,'connection_status',side_effect=AssertionError('No direct credential lookup')),patch.object(storage,'write_media_generation_job'):
            for fields in ({'kind':'narration','script':'Hello','narrationConnectionId':'pythia'},):
                job=storage.create_media_generation_job('project',MediaGenerationJobCreate(sceneId='scene',purpose='Demo',**fields))
                self.assertEqual(job.aiConnectionRevision,'pythia-media-revision1')
            with self.assertRaisesRegex(ValueError, 'unavailable'):
                storage.create_media_generation_job('project', MediaGenerationJobCreate(kind='video',sceneId='scene',purpose='Demo',prompt='Rolling ball'))
    def test_video_rejects_unsupported_dimensions_and_length(self):
        for extra in ({'durationSeconds':31},{'durationSeconds':3},{'width':1024,'height':1024}):
            with self.assertRaises(ValidationError): MediaGenerationJobCreate(kind='video',sceneId='scene',purpose='Demo',prompt='Rolling ball',**extra)
        for seconds in (4, 8, 30):
            self.assertEqual(MediaGenerationJobCreate(kind='video',sceneId='scene',purpose='Demo',prompt='Title',durationSeconds=seconds).durationSeconds, seconds)

if __name__=='__main__': unittest.main()
