"""Map a validated handoff onto Chimera's existing revision-bound review queue."""

from hashlib import sha256

from . import storage
from .handoff_contract.production_handoff import FORMAT, decode
from .models import EnhancementProposalChangeCreate, EnhancementProposalCreate, HandoffSceneDraft

CAPABILITY = "production.handoff.v1"


def _assessment(item, scene, handoff_id):
    if item is None:
        return None
    namespace = sha256(f"{handoff_id}:{item['id']}".encode()).hexdigest()
    return {
        "identifier": f"handoff-{namespace[:55]}",
        "type": item["type"],
        "prompt": item["prompt"],
        "choices": [{"identifier": choice["id"], "text": choice["text"]} for choice in item["choices"]],
        "correctResponse": item["correct_choice_id"],
        "correctFeedback": item["correct_feedback"],
        "incorrectFeedback": item["incorrect_feedback"],
        "metadata": {"learningObjectiveRefs": scene["objective_ids"]},
    }


def _draft(scene, handoff_id):
    assessment = _assessment(scene["assessment"], scene, handoff_id)
    return {
        "title": scene["title"],
        "sceneType": scene["kind"],
        "extractedText": scene["screen_text"],
        "narration": scene["narration"]["script"],
        "actionDescription": scene["action_description"],
        "notes": scene["production_notes"],
        "assessmentItem": assessment,
    }


def queue(project_id, raw, expected_revision):
    document = decode(raw)
    handoff_id = document["handoff_id"]
    storyboard = document["storyboard"]
    with storage.storyboard_transaction():
        project = storage.read_project(project_id)
        current = project.storyboard
        existing = next((item for item in storage.list_enhancement_proposals(project_id)
                         if item.sourceCapability == CAPABILITY and item.sourceArtifactId == handoff_id), None)
        if existing:
            if existing.sourceArtifact != document:
                raise storage.EnhancementProposalConflict("This handoff ID already identifies different content")
            return existing
        if expected_revision != current.revision:
            raise storage.StoryboardRevisionConflict(expected_revision, current.revision)
        drafts = [_draft(scene, handoff_id) for scene in storyboard["scenes"]]
        current_assessments = {scene.assessmentItem.identifier for scene in current.scenes if scene.assessmentItem}
        if any(draft["assessmentItem"] and draft["assessmentItem"]["identifier"] in current_assessments
               for draft in drafts):
            raise storage.EnhancementProposalConflict("A handoff assessment already exists in this storyboard")
        return storage.create_enhancement_proposal(project_id, EnhancementProposalCreate(
            changes=[EnhancementProposalChangeCreate(
                targetSceneId=current.scenes[-1].id if current.scenes else None,
                field="additionalScenes",
                proposedValue=drafts,
            )],
            rationale=f"Pythia production handoff · {storyboard['title']}",
            origin="author",
            sourceRevision=current.revision,
            sourceArtifactId=handoff_id,
            sourceCapability=CAPABILITY,
            sourceArtifact=document,
        ), scene_draft=HandoffSceneDraft)
