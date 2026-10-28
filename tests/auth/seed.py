"""Isolated fixture for the real HTTPS authentication browser harness."""
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from backend.app import storage
from backend.app.identity import ProjectMembership
from backend.app.models import ProjectCreate, SceneCreate, SceneUpdate
from backend.app.authoring import native_layout
from backend.app.password_auth import AccountStore
from backend.app.platform import ActorContext, REQUEST_ACTOR
from backend.app.deployment import public_origin

store = AccountStore(storage.ROOT)
password = os.environ["CHIMERA_TEST_PASSWORD"]
admin = store.provision("operator@example.test", password, "Test Operator", ["administrator", "instructional-designer"])
reviewer = store.provision("reviewer@example.test", password, "Test Reviewer", ["reviewer"])
actor = ActorContext(actorId=admin, actorDisplayName="Test Operator", installationId=public_origin(), deploymentMode="team")
context_token = REQUEST_ACTOR.set(actor)
try:
    project = storage.create_project(ProjectCreate(title="Hosted qualification"), actor)
    project = storage.create_scene(project.id, SceneCreate(title="Review the learning objective", extractedText=["Confirm the learner-facing content and leave a review comment."]))
    scene = project.storyboard.scenes[0]
    project = storage.update_scene(project.id, scene.id, SceneUpdate(visualLayout=native_layout(scene)))
    other = storage.create_project(ProjectCreate(title="Private project"), actor)
    for user_id, role in ((admin, "instructional-designer"), (reviewer, "reviewer")):
        store.add_project_membership(ProjectMembership(projectId=project.id, userId=user_id, role=role))
    reset = store.issue_reset("operator@example.test")
    review = store.issue_review(project.id, reviewer, project.storyboard.revision, 1)
finally:
    REQUEST_ACTOR.reset(context_token)
print(json.dumps({"projectId": project.id, "otherProjectId": other.id, "reviewerId": reviewer, "resetToken": reset, "reviewUrl": review["url"]}))
