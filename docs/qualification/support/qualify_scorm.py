import hashlib
import io
import json
import math
import struct
import wave
import os
import sys
import tempfile
from pathlib import Path
root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root))
os.environ['CHIMERA_WORKSPACE'] = tempfile.mkdtemp(prefix='chimera-scorm-qualification-')
from backend.app import storage, main
from backend.app.models import ProjectCreate, SceneCreate, SceneUpdate, AssetAttributionUpdate, SingleChoiceAssessment, AssessmentChoice, AssessmentSettings

out = root / 'workspace/qualification-regenerated/scorm'
out.mkdir(parents=True, exist_ok=True)
project = storage.create_project(ProjectCreate(title='SCORM 1.2 release qualification'))
project = storage.create_scene(project.id, SceneCreate(title='Required audio and bookmark', extractedText=['Play the three-second tone to the end, then advance. Exit on the assessment scene before answering, and reopen to check the bookmark.']))
data = io.BytesIO()
with wave.open(data, 'wb') as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(8000)
    wav.writeframes(b''.join(struct.pack('<h', int(5000 * math.sin(2 * math.pi * 440 * i / 8000))) for i in range(24000)))
project = storage.add_project_asset(project.id, 'qualification-tone.wav', data.getvalue(), 'audio')
asset = project.storyboard.assets[0]
project = storage.update_project_asset_attribution(project.id, asset.id, AssetAttributionUpdate(attributionText='Original locally generated qualification tone', attributionStatus='complete'))
project = storage.update_scene(project.id, project.storyboard.scenes[0].id, SceneUpdate(audioAssets=[asset.id], audioRequired=True))
project = storage.create_scene(project.id, SceneCreate(title='Assessment resume and score', sceneType='assessment', extractedText=['First answer Weather only (incorrect), exit and resume, then retry with Equipment (correct).']))
project = storage.update_scene(project.id, project.storyboard.scenes[-1].id, SceneUpdate(assessmentSettings=AssessmentSettings(maxAttempts=3), assessmentItem=SingleChoiceAssessment(identifier='QUALIFY_SCORM12', prompt='What should you inspect before use?', choices=[AssessmentChoice(identifier='equipment', text='Equipment'), AssessmentChoice(identifier='weather', text='Weather only')], correctResponse='equipment', correctFeedback='Correct: inspect the equipment.', incorrectFeedback='Try again: inspect equipment.')))
response = main.export_scorm_12(project.id)
package = out / 'scorm12-qualification.zip'
package.write_bytes(response.body)
(out / 'scorm12-source.json').write_text(project.model_dump_json(indent=2), encoding='utf-8')
report = storage.project_path(project.id) / 'reports/build-scorm12.json'
(out / 'scorm12-build.json').write_bytes(report.read_bytes())
print(json.dumps({'package': str(package.resolve()), 'sha256': hashlib.sha256(response.body).hexdigest(), 'project': project.id, 'revision': project.storyboard.revision}))
