import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from backend.app import ai_connection, media_connections as routing, narration_connections, pythia_media, storage, media_generation
from backend.app.models import MediaGenerationJobCreate


class ConnectionRoutingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.legacy = {'provider':'openai','configured':True,'revision':'direct-r1','textModel':'text-direct','imageModel':'image-direct','audioModel':'audio-direct'}
        self.saved = {'connections':[{'id':'narration-111111111111','name':'Saved ElevenLabs','provider':'elevenlabs','configured':True,'voice':'voice-1','model':'eleven-model','language':'en-US','revision':'speech-r1'},
            {'id':'narration-222222222222','name':'Saved video setup','provider':'synthesia','configured':True,'voice':'','model':'','language':'en-US','revision':'video-r1'}]}
        self.enterContext(patch.object(ai_connection,'connection_status',return_value=self.legacy))
        self.enterContext(patch.object(narration_connections,'narration_status',return_value=self.saved))
        self.enterContext(patch.object(pythia_media,'enabled',return_value=True))
        self.enterContext(patch.object(pythia_media,'image_status',return_value={'configured':True,'revision':'pythia-image-r1','imageModel':'image-pythia'}))
        self.enterContext(patch.object(pythia_media,'media_status',return_value={'configured':True,'revision':'media-r1','models':{'scene':'scene-pythia','narration':'audio-pythia'}}))
        self.client=Mock()
        self.client.resolve_media_connection.side_effect=lambda document: {'connection':next(item for item in document['connections'] if item['id']==document['connection_id'])}
        self.enterContext(patch.object(routing,'PythiaProvider',return_value=self.client))

    def test_settings_inventory_http_route_is_authorized_and_secret_free(self):
        from fastapi.testclient import TestClient
        from backend.app import main
        with patch.object(main, 'ROOT', self.root), patch.object(storage, 'ROOT', self.root), patch.object(storage, 'PROJECTS', self.root / 'projects'), TestClient(main.app) as client:
            response = client.get('/api/ai-connections')
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()['defaults']['image'], 'pythia')
        self.assertNotIn('apiKey', response.text)
        self.assertEqual(response.headers['cache-control'], 'no-store')

    def test_catalog_combines_actual_settings_and_enables_configured_video(self):
        catalog=routing.connection_catalog(self.root)
        self.assertEqual(catalog['defaults'],{'scene':'pythia','image':'pythia','narration':'pythia','video':'narration-222222222222'})
        self.assertEqual(len(catalog['connections']),4)
        self.assertEqual(catalog['connections'][-1]['readyFor'],['video'])
        self.assertEqual(catalog['connections'][-1]['revisions'],{'video':'video-r1'})
        self.assertEqual(catalog['videoUnavailableReason'],'')
    def test_selected_alternative_is_checked_by_pythia_without_sending_keys(self):
        selected=routing.select_connection(self.root,'narration','narration-111111111111')
        self.assertEqual(selected['provider'],'elevenlabs')
        document=self.client.resolve_media_connection.call_args.args[0]
        self.assertTrue(all(set(item)=={'id','provider','executor','readyFor','revision','model'} for item in document['connections']))
        self.assertEqual(document['connection_id'],selected['id'])
    def test_unavailable_and_wrong_media_do_not_choose_another_provider(self):
        for kind,identifier in [('image','narration-111111111111'),('narration','narration-222222222222'),('narration','removed')]:
            with self.assertRaises(ValueError): routing.select_connection(self.root,kind,identifier)
        self.client.resolve_media_connection.assert_not_called()
    def test_saved_pythia_address_is_discovered_without_old_image_opt_in(self):
        (self.root / 'pythia-connection.json').write_text('{"baseUrl":"http://127.0.0.1:8002"}',encoding='utf-8')
        with patch.object(pythia_media,'enabled',return_value=False):
            catalog=routing.connection_catalog(self.root)
        self.assertEqual(catalog['defaults']['scene'],'pythia')
        self.assertEqual(catalog['defaults']['image'],'pythia')

    def test_existing_direct_provider_remains_available_without_pythia(self):
        with patch.object(pythia_media,'enabled',return_value=False):
            selected=routing.select_connection(self.root,'image','legacy-openai')
        self.assertEqual(selected['executor'],'chimera')
        self.client.resolve_media_connection.assert_not_called()
    def test_explicit_direct_image_job_does_not_switch_to_global_pythia_default(self):
        project=SimpleNamespace(storyboard=SimpleNamespace(scenes=[SimpleNamespace(id='scene')],revision=3))
        with patch.object(storage,'ROOT',self.root),patch.object(storage,'read_project',return_value=project),patch.object(storage,'write_media_generation_job'):
            job=storage.create_media_generation_job('project',MediaGenerationJobCreate(connectionId='legacy-openai',kind='image',sceneId='scene',purpose='Test',prompt='Test image'))
        self.assertEqual(job.connectionId,'legacy-openai')
        self.assertEqual(job.aiConnectionRevision,'direct-r1')
        provider=Mock()
        provider.name='direct'
        provider.image_model='image-direct'
        provider.generate_image.side_effect=RuntimeError('expected test stop')
        with patch.object(media_generation.storage,'read_media_generation_job',return_value=job),patch.object(media_generation.storage,'update_media_generation_job'),patch.object(media_generation,'_provider',return_value=provider) as direct,patch.object(media_generation.pythia_media,'PythiaImageProvider',side_effect=AssertionError('No switch to Pythia')):
            # Keep the normal factory identity so explicit routing is tested.
            with patch.object(media_generation,'_provider_factory',direct):
                media_generation._run_job('project',job.id)
        direct.assert_called_once_with('direct-r1')
    def test_connection_disagreement_is_rejected_before_job_creation(self):
        project=SimpleNamespace(storyboard=SimpleNamespace(scenes=[SimpleNamespace(id='scene')],revision=3))
        with patch.object(storage,'ROOT',self.root),patch.object(storage,'read_project',return_value=project),patch.object(storage,'write_media_generation_job') as write:
            with self.assertRaisesRegex(ValueError,'disagree'):
                storage.create_media_generation_job('project',MediaGenerationJobCreate(connectionId='pythia',narrationConnectionId='legacy-openai',kind='narration',sceneId='scene',purpose='Test',script='Hello'))
        write.assert_not_called()

if __name__=='__main__': unittest.main()
