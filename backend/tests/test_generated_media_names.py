import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from backend.app import storage
from backend.app.models import ProjectCreate, SceneCreate

class GeneratedMediaNamesTests(unittest.TestCase):
    def test_existing_assets_get_scene_names_and_distinct_takes_without_file_moves(self):
        with tempfile.TemporaryDirectory() as temporary, patch.object(storage, "ROOT", Path(temporary)), patch.object(storage, "PROJECTS", Path(temporary) / "projects"):
            project = storage.create_project(ProjectCreate(title="Naming"))
            project = storage.create_scene(project.id, SceneCreate(title="First\nscene"))
            scene = project.storyboard.scenes[0]
            directory = storage.project_path(project.id) / "generated-candidates"
            directory.mkdir()
            for index in (2, 1):
                candidate_id = f"candidate-{index:012x}"
                (directory / f"{candidate_id}.json").write_text(json.dumps({"id": candidate_id, "sceneId": scene.id, "kind": "audio", "createdAt": f"2026-11-02T12:00:0{index}Z", "approvedAssetId": f"audio-{index}"}))
            names = storage.generated_media_names(project.id, project.storyboard)
            self.assertEqual(names["audio-1"], "Scene 01 - First scene - Narration - Take 1.mp3")
            self.assertEqual(names["audio-2"], "Scene 01 - First scene - Narration - Take 2.mp3")
            self.assertEqual(names["candidate-000000000001"], names["audio-1"])
            self.assertEqual(len(list(directory.glob("*.json"))), 2)

if __name__ == "__main__":
    unittest.main()
