import hashlib
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from backend.app import storage
from backend.app.models import GeneratedAssetCandidate, ProjectCreate, SceneCreate, AssetAttributionUpdate

class GeneratedAttributionTests(unittest.TestCase):
    def test_approval_attributes_all_generated_media_and_preserves_manual_credit(self):
        with tempfile.TemporaryDirectory() as temporary, patch.object(storage, "ROOT", Path(temporary)), patch.object(storage, "PROJECTS", Path(temporary) / "projects"):
            for index, (kind, extension) in enumerate((("audio", ".mp3"), ("image", ".png")), 1):
                with self.subTest(kind=kind):
                    project = storage.create_project(ProjectCreate(title=f"Generated {kind}"))
                    project = storage.create_scene(project.id, SceneCreate(title="Destination"))
                    content = f"test generated {kind}".encode()
                    candidate_id = f"candidate-{index:012x}"
                    def candidate(identifier):
                        return GeneratedAssetCandidate(id=identifier, projectId=project.id, jobId="test-job", sourceRevision=project.storyboard.revision, sceneId=project.storyboard.scenes[0].id, kind=kind, filename=identifier+extension, contentType="application/octet-stream", sizeBytes=len(content), sha256=hashlib.sha256(content).hexdigest(), path=f"generated-candidates/{identifier}{extension}", purpose="Test", prompt="Test", provider="Pythia", createdAt=storage.now_iso())
                    storage.write_generated_candidate(candidate(candidate_id), content)
                    _, _, approved = storage.approve_generated_candidate(project.id, candidate_id, project.storyboard.revision)
                    asset = approved.storyboard.assets[0]
                    self.assertEqual(asset.attributionText, "AI-Generated")
                    self.assertEqual(asset.attributionStatus, "complete")
                    approved = storage.update_project_asset_attribution(project.id, asset.id, AssetAttributionUpdate(attributionText="Custom retained credit", attributionStatus="complete"), approved.storyboard.revision)
                    duplicate_id = f"candidate-{index+10:012x}"
                    storage.write_generated_candidate(candidate(duplicate_id), content)
                    _, _, approved = storage.approve_generated_candidate(project.id, duplicate_id, approved.storyboard.revision)
                    self.assertEqual(len(approved.storyboard.assets), 1)
                    self.assertEqual(approved.storyboard.assets[0].attributionText, "Custom retained credit")

if __name__ == "__main__": unittest.main()
