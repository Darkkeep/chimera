"""Add inert example job states after starting the isolated documentation API."""
import json
import os
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[3]
demo = root / "workspace/user-guide-restored"
os.environ["CHIMERA_WORKSPACE"] = str(demo / "data")
sys.path.insert(0, str(root / "backend"))
from app import storage
from app.models import EnhancementJobCreate

project_id = json.loads((demo / "fixture.json").read_text(encoding="utf-8"))["projectId"]
for status in ("failed", "queued"):
    job = storage.create_enhancement_job(project_id, EnhancementJobCreate(
        scope="whole-course", goal="Documentation fixture only; no AI call.",
    ))
    storage.update_enhancement_job(
        project_id, job.id, status=status, message="Documentation example: " + status,
        error="Demonstration error for Retry control." if status == "failed" else None,
    )
print("Prepared demonstration job records without starting workers.")
