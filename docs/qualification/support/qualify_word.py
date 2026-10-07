import io
import json
import os
import sys
import tempfile
from pathlib import Path
root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(root))
os.environ['CHIMERA_WORKSPACE'] = tempfile.mkdtemp(prefix='chimera-word-qualification-')
from PIL import Image, ImageDraw
from backend.app import storage, main
from backend.app.models import ProjectCreate, SceneCreate, SceneUpdate, AssetAttributionUpdate, SingleChoiceAssessment, AssessmentChoice

out = root / 'workspace/qualification-regenerated/word'
out.mkdir(parents=True, exist_ok=True)
project = storage.create_project(ProjectCreate(title='Release qualification — café storyboard'))
project = storage.create_scene(project.id, SceneCreate(title='Long Unicode scene — café', extractedText=[f'Paragraph {i}: Inspect the equipment before use. Café, naïve façade, Ελληνικά, résumé. Record the result and confirm the safe operating condition. ' * 4 for i in range(1, 13)], notes='Speaker notes remain editable authoring material.', actionDescription='Production direction: display the inspection illustration.'))
scene = project.storyboard.scenes[0]
image = Image.new('RGB', (900, 300), '#e7eef4')
ImageDraw.Draw(image).text((40, 140), 'Qualification illustration - equipment inspection', fill='black')
data = io.BytesIO()
image.save(data, format='PNG')
project = storage.add_project_asset(project.id, 'inspection.png', data.getvalue(), 'image')
asset = project.storyboard.assets[0]
project = storage.update_project_asset_attribution(project.id, asset.id, AssetAttributionUpdate(attributionText='Original qualification fixture created locally', attributionStatus='complete'))
project = storage.update_scene(project.id, scene.id, SceneUpdate(imageAssets=[asset.id], imageAltText={asset.id: 'Equipment inspection illustration.'}))
project = storage.create_scene(project.id, SceneCreate(title='Assessment and editable response table', extractedText=['Choose the correct inspection action.']))
project = storage.update_scene(project.id, project.storyboard.scenes[-1].id, SceneUpdate(assessmentItem=SingleChoiceAssessment(identifier='QUALIFICATION', prompt='What should you inspect before use?', choices=[AssessmentChoice(identifier='equipment', text='Equipment — check condition and record findings.'), AssessmentChoice(identifier='weather', text='Weather only')], correctResponse='equipment', correctFeedback='Correct — inspect the equipment.')))
for answers in (False, True):
    response = main.export_storyboard_docx(project.id, include_answer_key=answers)
    (out / ('storyboard-answers.docx' if answers else 'storyboard.docx')).write_bytes(response.body)
(out / 'source.json').write_text(project.model_dump_json(indent=2), encoding='utf-8')
print(json.dumps({'project': project.id, 'revision': project.storyboard.revision, 'output': str(out.resolve())}))
