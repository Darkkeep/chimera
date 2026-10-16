import os
from typing import Protocol
from urllib.parse import quote, urlsplit

import httpx


class LearningIntelligenceProvider(Protocol):
    def health(self) -> dict[str, object]: ...

    def capabilities(self) -> dict[str, object]: ...

    def submit_task(self, request: dict[str, object]) -> dict[str, object]: ...

    def task_status(self, task_id: str) -> dict[str, object]: ...

    def artifact(self, artifact_id: str) -> dict[str, object]: ...

    def cancel_task(self, task_id: str) -> dict[str, object]: ...


class PythiaUnavailableError(RuntimeError):
    def __init__(self, message: str, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class PythiaProvider:
    def __init__(self, base_url: str | None = None) -> None:
        configured_url = (base_url or os.environ.get("CHIMERA_PYTHIA_BASE_URL") or "http://localhost:8000").strip()
        parsed = urlsplit(configured_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("CHIMERA_PYTHIA_BASE_URL must be an HTTP(S) URL without credentials, query, or fragment")
        self.base_url = configured_url.rstrip("/")

    def _request(self, method: str, path: str, body: dict[str, object] | None = None) -> dict[str, object]:
        try:
            response = httpx.request(method, f"{self.base_url}{path}", json=body, timeout=10.0)
            response.raise_for_status()
            result = response.json()
        except httpx.HTTPStatusError as error:
            status_code = error.response.status_code
            detail = error.response.text[:500]
            raise PythiaUnavailableError(f"Pythia returned HTTP {status_code}: {detail}", status_code) from error
        except (httpx.RequestError, ValueError) as error:
            raise PythiaUnavailableError(f"Pythia request failed: {error}") from error
        if not isinstance(result, dict):
            raise PythiaUnavailableError("Pythia returned an invalid JSON response")
        return result

    def health(self) -> dict[str, object]:
        return self._request("GET", "/health")

    def capabilities(self) -> dict[str, object]:
        return self._request("GET", "/capabilities")

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