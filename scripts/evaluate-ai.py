"""Evaluate captured synthetic outputs. This script never calls a provider."""
import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.app.models import CourseContentDraft, SceneContentDraft


def evaluate(records: list[dict]) -> dict:
    contract = json.loads((ROOT / "docs/qualification/ai-evaluation-cases.json").read_text(encoding="utf-8"))
    supplied = {record["caseId"]: record for record in records}
    results = []
    for case in contract["cases"]:
        record = supplied.get(case["id"])
        if record is None:
            results.append({"caseId": case["id"], "status": "missing"})
            continue
        errors = []
        output = record.get("output")
        try:
            if case["kind"] == "course":
                CourseContentDraft.model_validate(output)
            elif case["kind"] == "scene":
                SceneContentDraft.model_validate(output)
            elif case["kind"] == "enhancement":
                if not isinstance(output, dict) or not output.get("resourceConflicts"):
                    errors.append("Expected cited conflicting guidance")
            elif not record.get("rejectedBeforeNetwork"):
                errors.append("Expected rejection before network submission")
        except ValueError:
            errors.append("Output does not match the draft contract")
        text = json.dumps(output, ensure_ascii=False).casefold()
        for value in case["requiredText"]:
            if value.casefold() not in text:
                errors.append(f"Missing expected content: {value}")
        for value in case["forbiddenText"]:
            if value.casefold() in text:
                errors.append(f"Unsupported content: {value}")
        present = {s.get("assessmentItem", {}).get("type") for s in (output or {}).get("scenes", []) if s.get("assessmentItem")} if isinstance(output, dict) else set()
        if set(case.get("requiredTypes", [])) - present:
            errors.append("Missing required assessment types")
        review = record.get("humanReview", {})
        complete = bool(review.get("reviewer") and review.get("reviewedAt")) and all(type(review.get(key)) is int and review[key] == 2 for key in contract["humanRubric"]["dimensions"]) and review.get("criticalErrors") == 0
        results.append({"caseId": case["id"], "status": "failed" if errors else "accepted" if complete else "human-review-pending", "errors": errors})
    return {"passed": all(r["status"] == "accepted" for r in results), "cases": results,
            "scope": "Captured-output contract checks plus explicit human rubric; not live-provider reliability certification."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("responses", type=Path, help="JSON array with caseId, output and optional humanReview")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    report = evaluate(json.loads(args.responses.read_text(encoding="utf-8")))
    content = json.dumps(report, indent=2)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(content + "\n", encoding="utf-8")
    print(content)
    sys.exit(0 if report["passed"] else 1)
