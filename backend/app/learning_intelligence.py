import os
from typing import Protocol
from urllib.parse import quote, urlsplit

import httpx
from pydantic import TypeAdapter, ValidationError

from .models import AssessmentItem


class LearningIntelligenceProvider(Protocol):
    def health(self) -> dict[str, object]: ...

    def capabilities(self) -> dict[str, object]: ...

    def submit_task(self, request: dict[str, object]) -> dict[str, object]: ...

    def task_status(self, task_id: str) -> dict[str, object]: ...

    def artifact(self, artifact_id: str) -> dict[str, object]: ...

    def cancel_task(self, task_id: str) -> dict[str, object]: ...


class PythiaUnavailableError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None, request_id: str | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.request_id = request_id


class PythiaProvider:
    def __init__(self, base_url: str | None = None) -> None:
        from .storage import ROOT
        from .pythia_connection import configured_engine_url
        configured_url = (base_url or configured_engine_url(ROOT)).strip()
        parsed = urlsplit(configured_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("CHIMERA_PYTHIA_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment")
        self.base_url = configured_url.rstrip("/")

    def _request(self, method: str, path: str, body: dict[str, object] | None = None) -> dict[str, object]:
        try:
            request_options: dict[str, object] = {"json": body, "timeout": 10.0}
            api_key = os.environ.get("CHIMERA_PYTHIA_API_KEY", "").strip()
            if api_key:
                request_options["headers"] = {"Authorization": f"Bearer {api_key}"}
            response = httpx.request(method, f"{self.base_url}{path}", **request_options)
            response.raise_for_status()
            result = response.json()
        except httpx.HTTPStatusError as error:
            status_code = error.response.status_code
            detail = error.response.text[:500]
            request_id = error.response.headers.get("X-Pythia-Request-Id")
            reference = f" (Engine request ID: {request_id})" if request_id else ""
            raise PythiaUnavailableError(f"Pythia returned HTTP {status_code}: {detail}{reference}", status_code, request_id) from error
        except (httpx.RequestError, ValueError) as error:
            raise PythiaUnavailableError(f"Pythia request failed: {error}") from error
        if not isinstance(result, dict):
            raise PythiaUnavailableError("Pythia returned an invalid JSON response")
        return result

    def health(self) -> dict[str, object]:
        return self._request("GET", "/health")

    def capabilities(self) -> dict[str, object]:
        return self._request("GET", "/capabilities")

    def providers(self) -> dict[str, object]:
        return self._request("GET", "/providers")

    def telemetry(self) -> dict[str, object]:
        return self._request("GET", "/telemetry")

    def submit_task(self, request: dict[str, object]) -> dict[str, object]:
        return self._request("POST", "/tasks", request)

    def task_status(self, task_id: str) -> dict[str, object]:
        return self._request("GET", f"/tasks/{quote(task_id, safe='')}")

    def artifact(self, artifact_id: str) -> dict[str, object]:
        return self._request("GET", f"/artifacts/{quote(artifact_id, safe='')}")

    def cancel_task(self, task_id: str) -> dict[str, object]:
        return self._request("POST", f"/tasks/{quote(task_id, safe='')}/cancel")


def validate_storyboard_analysis(
    envelope: dict[str, object], project_id: str, scene_id: str,
) -> dict[str, object]:
    artifact = envelope.get("artifact")
    validation = envelope.get("validation")
    producer = envelope.get("producer")
    payload = envelope.get("payload")
    if not isinstance(artifact, dict) or artifact.get("type") != "storyboard-analysis":
        raise ValueError("Pythia artifact type is not storyboard-analysis")
    if envelope.get("status") != "draft":
        raise ValueError("Pythia artifact is not a draft")
    if not isinstance(validation, dict) or validation.get("state") != "passed":
        raise ValueError("Pythia artifact did not pass validation")
    if not isinstance(producer, dict) or producer.get("skill") != "storyboard-producer":
        raise ValueError("Pythia artifact producer is not storyboard-producer")
    if not isinstance(payload, dict):
        raise ValueError("Pythia artifact payload is invalid")
    if payload.get("project_id") != project_id or payload.get("scene_id") != scene_id:
        raise ValueError("Pythia artifact does not match the requested project and scene")
    if not isinstance(payload.get("source_refs"), list):
        raise ValueError("Pythia artifact source_refs must be a list")
    for field in ("findings", "recommendations", "uncertainties", "review_questions"):
        if not isinstance(payload.get(field), list):
            raise ValueError(f"Pythia artifact {field} must be a list")

    findings = payload["findings"]
    finding_ids: set[str] = set()
    for finding in findings:
        if not isinstance(finding, dict):
            raise ValueError("Pythia artifact findings must contain objects")
        for field in ("id", "category", "statement", "uncertainty"):
            if not isinstance(finding.get(field), str) or not finding[field].strip():
                raise ValueError(f"Pythia artifact finding {field} must be a non-empty string")
        evidence_refs = finding.get("evidence_refs")
        if not isinstance(evidence_refs, list) or any(not isinstance(ref, str) or not ref for ref in evidence_refs):
            raise ValueError("Pythia artifact finding evidence_refs must be a list of strings")
        finding_id = finding["id"]
        if finding_id in finding_ids:
            raise ValueError("Pythia artifact finding IDs must be unique")
        finding_ids.add(finding_id)

    recommendation_ids: set[str] = set()
    for recommendation in payload["recommendations"]:
        if not isinstance(recommendation, dict):
            raise ValueError("Pythia artifact recommendations must contain objects")
        for field in ("id", "statement"):
            if not isinstance(recommendation.get(field), str) or not recommendation[field].strip():
                raise ValueError(f"Pythia artifact recommendation {field} must be a non-empty string")
        finding_refs = recommendation.get("finding_refs")
        if not isinstance(finding_refs, list) or any(not isinstance(ref, str) or not ref for ref in finding_refs):
            raise ValueError("Pythia artifact recommendation finding_refs must be a list of strings")
        recommendation_id = recommendation["id"]
        if recommendation_id in recommendation_ids:
            raise ValueError("Pythia artifact recommendation IDs must be unique")
        recommendation_ids.add(recommendation_id)
        if any(ref not in finding_ids for ref in finding_refs):
            raise ValueError("Pythia artifact recommendation finding_refs must reference findings")
    return envelope


def validate_storyboard_transformation(
    envelope: dict[str, object], project_id: str, source_scene_ids: list[str],
) -> dict[str, object]:
    artifact = envelope.get("artifact")
    validation = envelope.get("validation")
    payload = envelope.get("payload")
    if envelope.get("schema_version") != "1.0":
        raise ValueError("Pythia transformation schema version is unsupported")
    if not isinstance(artifact, dict) or artifact.get("type") != "storyboard-transformation":
        raise ValueError("Pythia artifact type is not storyboard-transformation")
    if envelope.get("status") != "draft":
        raise ValueError("Pythia transformation is not a draft")
    if not isinstance(validation, dict) or validation.get("state") != "passed":
        raise ValueError("Pythia transformation did not pass validation")
    if not isinstance(envelope.get("producer"), dict):
        raise ValueError("Pythia transformation producer is invalid")
    if not isinstance(payload, dict) or payload.get("project_id") != project_id:
        raise ValueError("Pythia transformation does not match the requested project")
    if payload.get("source_scene_ids") != source_scene_ids:
        raise ValueError("Pythia transformation does not match the selected scenes")
    source_refs = payload.get("source_refs")
    expected_source_refs = [f"chimera://{project_id}/scenes/{scene_id}" for scene_id in source_scene_ids]
    if source_refs != expected_source_refs or envelope.get("sources") != expected_source_refs:
        raise ValueError("Pythia transformation source_refs do not match the selected scenes")
    if not isinstance(payload.get("rationale"), str) or not payload["rationale"].strip():
        raise ValueError("Pythia transformation rationale must be a non-empty string")
    proposed_scenes = payload.get("proposed_scenes")
    if not isinstance(proposed_scenes, list) or not proposed_scenes:
        raise ValueError("Pythia transformation proposed_scenes must be a non-empty list")
    proposal_scene_ids: set[str] = set()
    required_strings = (
        "proposal_scene_id", "purpose", "title", "interaction_recommendation",
        "production_notes", "rationale",
    )
    required_lists = ("source_scene_ids", "learner_content", "media_requirements", "assessment_opportunities")
    for proposed_scene in proposed_scenes:
        if not isinstance(proposed_scene, dict):
            raise ValueError("Pythia proposed scenes must be objects")
        for field in required_strings:
            if not isinstance(proposed_scene.get(field), str) or not proposed_scene[field].strip():
                raise ValueError(f"Pythia proposed scene {field} must be a non-empty string")
        for field in required_lists:
            values = proposed_scene.get(field)
            if not isinstance(values, list) or any(not isinstance(value, str) or not value.strip() for value in values):
                raise ValueError(f"Pythia proposed scene {field} must be a list of non-empty strings")
            if field == "learner_content" and not values:
                raise ValueError("Pythia proposed scene learner_content must not be empty")
        proposed_scene_sources = proposed_scene["source_scene_ids"]
        if (
            not proposed_scene_sources
            or len(set(proposed_scene_sources)) != len(proposed_scene_sources)
            or any(source_id not in source_scene_ids for source_id in proposed_scene_sources)
        ):
            raise ValueError("Pythia proposed scene source_scene_ids must reference selected scenes")
        proposal_scene_id = proposed_scene["proposal_scene_id"]
        if proposal_scene_id in proposal_scene_ids:
            raise ValueError("Pythia proposed scene IDs must be unique")
        proposal_scene_ids.add(proposal_scene_id)
    return envelope


def validate_assessment_blueprint(
    envelope: dict[str, object],
    project_id: str,
    source_scene_ids: list[str],
    objective_ids: list[str],
) -> dict[str, object]:
    artifact = envelope.get("artifact")
    validation = envelope.get("validation")
    payload = envelope.get("payload")
    if envelope.get("schema_version") != "1.0":
        raise ValueError("Pythia assessment blueprint schema version is unsupported")
    if not isinstance(artifact, dict) or artifact.get("type") != "assessment-blueprint":
        raise ValueError("Pythia artifact type is not assessment-blueprint")
    if envelope.get("status") != "draft":
        raise ValueError("Pythia assessment blueprint is not a draft")
    if not isinstance(validation, dict) or validation.get("state") != "passed":
        raise ValueError("Pythia assessment blueprint did not pass validation")
    if not isinstance(envelope.get("producer"), dict):
        raise ValueError("Pythia assessment blueprint producer is invalid")
    expected_source_refs = [f"chimera://{project_id}/scenes/{scene_id}" for scene_id in source_scene_ids]
    if envelope.get("sources") != expected_source_refs:
        raise ValueError("Pythia assessment blueprint sources do not match the selected scenes")
    if not isinstance(payload, dict) or payload.get("project_id") != project_id:
        raise ValueError("Pythia assessment blueprint does not match the requested project")

    for field in ("candidate_interpretations", "unresolved_findings", "alignment", "limitations", "review_questions", "assumptions"):
        if not isinstance(payload.get(field), list):
            raise ValueError(f"Pythia assessment blueprint {field} must be a list")
    for field in ("limitations", "review_questions", "assumptions"):
        if any(not isinstance(value, str) or not value.strip() for value in payload[field]):
            raise ValueError(f"Pythia assessment blueprint {field} must contain non-empty strings")
    if not isinstance(payload.get("ai_use_boundaries"), str) or not payload["ai_use_boundaries"].strip():
        raise ValueError("Pythia assessment blueprint ai_use_boundaries must be a non-empty string")

    for alignment in payload["alignment"]:
        if not isinstance(alignment, dict):
            raise ValueError("Pythia assessment blueprint alignment entries must be objects")
        for field in ("objective_id", "evidence", "method", "scoring", "fairness"):
            if not isinstance(alignment.get(field), str) or not alignment[field].strip():
                raise ValueError(f"Pythia assessment blueprint alignment {field} must be a non-empty string")
        if alignment["objective_id"] not in objective_ids:
            raise ValueError("Pythia assessment blueprint alignment references an unknown objective")

    proposed_items = payload.get("proposed_items")
    if not isinstance(proposed_items, list) or not proposed_items:
        raise ValueError("Pythia assessment blueprint proposed_items must be a non-empty list")
    proposal_ids: set[str] = set()
    item_identifiers: set[str] = set()
    target_scene_ids: set[str] = set()
    item_adapter = TypeAdapter(AssessmentItem)
    for proposal in proposed_items:
        if not isinstance(proposal, dict):
            raise ValueError("Pythia proposed assessment items must be objects")
        for field in ("proposal_item_id", "target_scene_id", "rationale"):
            if not isinstance(proposal.get(field), str) or not proposal[field].strip():
                raise ValueError(f"Pythia proposed assessment item {field} must be a non-empty string")
        proposal_id = proposal["proposal_item_id"]
        target_scene_id = proposal["target_scene_id"]
        if proposal_id in proposal_ids:
            raise ValueError("Pythia assessment proposal item IDs must be unique")
        if target_scene_id not in source_scene_ids:
            raise ValueError("Pythia assessment item targets a scene outside the selected scope")
        if target_scene_id in target_scene_ids:
            raise ValueError("Chimera supports one assessment item proposal per target scene")
        proposal_ids.add(proposal_id)
        target_scene_ids.add(target_scene_id)
        item_objectives = proposal.get("objective_ids")
        if (
            not isinstance(item_objectives, list)
            or not item_objectives
            or any(not isinstance(item_id, str) or item_id not in objective_ids for item_id in item_objectives)
            or len(set(item_objectives)) != len(item_objectives)
        ):
            raise ValueError("Pythia assessment item objective_ids must reference supplied objectives")
        evidence_refs = proposal.get("evidence_refs")
        if (
            not isinstance(evidence_refs, list)
            or not evidence_refs
            or any(not isinstance(ref, str) or ref not in expected_source_refs for ref in evidence_refs)
        ):
            raise ValueError("Pythia assessment item evidence_refs must reference selected scenes")
        try:
            item = item_adapter.validate_python(proposal.get("item"))
        except ValidationError as error:
            raise ValueError(f"Pythia proposed item is not a valid Chimera assessment: {error.errors()[0]['msg']}") from error
        if item.identifier in item_identifiers:
            raise ValueError("Pythia assessment item identifiers must be unique")
        item_identifiers.add(item.identifier)
    return envelope


def validate_course_review(
    envelope: dict[str, object],
    project_id: str,
    course: dict[str, object],
) -> dict[str, object]:
    artifact = envelope.get("artifact")
    validation = envelope.get("validation")
    payload = envelope.get("payload")
    if envelope.get("schema_version") != "1.0":
        raise ValueError("Pythia course review schema version is unsupported")
    if not isinstance(artifact, dict) or artifact.get("type") != "course-review":
        raise ValueError("Pythia artifact type is not course-review")
    if envelope.get("status") != "draft":
        raise ValueError("Pythia course review is not a draft")
    if not isinstance(validation, dict) or validation.get("state") != "passed":
        raise ValueError("Pythia course review did not pass structural validation")
    if not isinstance(envelope.get("producer"), dict):
        raise ValueError("Pythia course review producer is invalid")
    if not isinstance(payload, dict) or payload.get("project_id") != project_id:
        raise ValueError("Pythia course review does not match the requested project")
    course_ref = course.get("course_ref")
    if payload.get("course_ref") != course_ref:
        raise ValueError("Pythia course review does not match the requested course")
    source_refs = [course_ref, *(scene.get("source_ref") for scene in course.get("scenes", []))]
    if envelope.get("sources") != source_refs:
        raise ValueError("Pythia course review sources do not match the submitted course scope")

    categories = {
        "objectives", "instructional_alignment", "assessment", "accessibility",
        "source_currency", "standards", "tracking", "packaging", "evaluation",
    }
    if not isinstance(payload.get("domain_status"), list) or not payload["domain_status"]:
        raise ValueError("Pythia course review domain_status must be a non-empty list")
    if not isinstance(payload.get("findings"), list):
        raise ValueError("Pythia course review findings must be a list")
    if not isinstance(payload.get("specialist_routes"), list) or not payload["specialist_routes"]:
        raise ValueError("Pythia course review specialist_routes must be a non-empty list")
    for field in ("limitations", "review_questions"):
        values = payload.get(field)
        if not isinstance(values, list) or any(not isinstance(value, str) or not value.strip() for value in values):
            raise ValueError(f"Pythia course review {field} must be a list of non-empty strings")

    domain_counts: dict[str, int] = {}
    for domain in payload["domain_status"]:
        if not isinstance(domain, dict) or domain.get("domain") not in categories:
            raise ValueError("Pythia course review domain_status contains an invalid domain")
        domain_name = domain["domain"]
        if domain_name in domain_counts:
            raise ValueError("Pythia course review domains must be unique")
        if domain.get("status") not in {"ready", "review_required", "insufficient_evidence"}:
            raise ValueError("Pythia course review domain status is invalid")
        if not isinstance(domain.get("finding_count"), int) or domain["finding_count"] < 0:
            raise ValueError("Pythia course review finding_count must be a non-negative integer")
        domain_counts[domain_name] = domain["finding_count"]

    allowed_objects = {
        "course": {course_ref},
        "scene": {scene.get("scene_id") for scene in course.get("scenes", [])},
        "objective": {objective.get("objective_id") for objective in course.get("objectives", [])},
        "assessment": {item.get("assessment_id") for item in course.get("assessment_items", [])},
        "asset": {asset.get("asset_id") for asset in course.get("assets", [])},
    }
    evidence_refs = {course_ref}
    for key in ("objectives", "scenes", "assessment_items", "assets", "source_records"):
        evidence_refs.update(item.get("source_ref") for item in course.get(key, []))
    finding_ids: set[str] = set()
    actual_domain_counts = {category: 0 for category in categories}
    for finding in payload["findings"]:
        if not isinstance(finding, dict):
            raise ValueError("Pythia course review findings must contain objects")
        for field in ("finding_id", "category", "severity", "statement", "recommendation"):
            if not isinstance(finding.get(field), str) or not finding[field].strip():
                raise ValueError(f"Pythia course review finding {field} must be a non-empty string")
        finding_id = finding["finding_id"]
        category = finding["category"]
        if finding_id in finding_ids:
            raise ValueError("Pythia course review finding IDs must be unique")
        if category not in categories:
            raise ValueError("Pythia course review finding category is invalid")
        if finding["severity"] not in {"info", "review", "attention"}:
            raise ValueError("Pythia course review finding severity is invalid")
        finding_ids.add(finding_id)
        actual_domain_counts[category] += 1
        object_refs = finding.get("object_refs")
        if not isinstance(object_refs, list) or not object_refs:
            raise ValueError("Pythia course review findings must reference course objects")
        for reference in object_refs:
            if not isinstance(reference, dict) or reference.get("object_type") not in allowed_objects:
                raise ValueError("Pythia course review finding object reference is invalid")
            if reference.get("object_id") not in allowed_objects[reference["object_type"]]:
                raise ValueError("Pythia course review finding references an object outside the submitted scope")
        refs = finding.get("evidence_refs")
        if not isinstance(refs, list) or not refs or any(not isinstance(ref, str) or ref not in evidence_refs for ref in refs):
            raise ValueError("Pythia course review finding evidence_refs are outside the submitted source scope")
        limitations = finding.get("limitations")
        if not isinstance(limitations, list) or any(not isinstance(value, str) or not value.strip() for value in limitations):
            raise ValueError("Pythia course review finding limitations must be a list of non-empty strings")
    if any(domain_counts.get(category) != count for category, count in actual_domain_counts.items() if category in domain_counts):
        raise ValueError("Pythia course review domain finding counts do not match findings")

    for route in payload["specialist_routes"]:
        if not isinstance(route, dict) or any(not isinstance(route.get(field), str) or not route[field].strip() for field in ("domain", "capability", "provider")):
            raise ValueError("Pythia course review specialist routes are invalid")
    return envelope
