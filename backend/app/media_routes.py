from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel, Field

from . import media, ocr, storage
from .models import AssetMetadataUpdate, MediaPlacementsUpdate, ProjectDetail

router = APIRouter()


def revision(value: str | None) -> int:
    if value is None:
        raise HTTPException(428, "An If-Match storyboard revision is required")
    try:
        result = int(value.strip('"'))
        if result < 1:
            raise ValueError
        return result
    except ValueError:
        raise HTTPException(400, "If-Match must contain a positive storyboard revision") from None


def call(operation, *args):
    try:
        return operation(*args)
    except storage.StoryboardRevisionConflict as error:
        raise HTTPException(412, str(error)) from error
    except FileNotFoundError as error:
        raise HTTPException(404, "Project, scene or media not found") from error
    except (ValueError, RuntimeError) as error:
        raise HTTPException(422, str(error)) from error


@router.get("/api/projects/{project_id}/media-capabilities")
def get_media_capabilities(project_id: str):
    from .main import get_authorization_policy
    from .platform import get_actor_context
    call(storage.read_project, project_id)
    return {"ocr": ocr.capability(), "canPublishShared": get_authorization_policy().allows(get_actor_context(), "admin.policy.manage")}


@router.patch("/api/projects/{project_id}/assets/{asset_id}/metadata", response_model=ProjectDetail)
def patch_media_metadata(project_id: str, asset_id: str, data: AssetMetadataUpdate, if_match: Annotated[str | None, Header()] = None):
    return call(media.update_metadata, project_id, asset_id, data, revision(if_match))


@router.get("/api/projects/{project_id}/assets/{asset_id}/captions")
def get_media_captions(project_id: str, asset_id: str):
    project = call(storage.read_project, project_id)
    asset = next((a for a in project.storyboard.assets if a.id == asset_id), None)
    if asset is None or not asset.captionsVtt:
        raise HTTPException(404, "Captions not found")
    return Response(asset.captionsVtt, media_type="text/vtt", headers={"X-Content-Type-Options": "nosniff"})


@router.get("/api/projects/{project_id}/assets/{asset_id}/usage")
def get_media_usage(project_id: str, asset_id: str):
    return media.asset_usage(call(storage.read_project, project_id), asset_id)


@router.delete("/api/projects/{project_id}/assets/{asset_id}", response_model=ProjectDetail)
def delete_project_media(project_id: str, asset_id: str, if_match: Annotated[str | None, Header()] = None):
    return call(media.delete_asset, project_id, asset_id, revision(if_match))


@router.put("/api/projects/{project_id}/course-media", response_model=ProjectDetail)
def put_course_media(project_id: str, data: MediaPlacementsUpdate, if_match: Annotated[str | None, Header()] = None):
    return call(media.write_placements, project_id, data, revision(if_match))


@router.put("/api/projects/{project_id}/scenes/{scene_id}/media-placements", response_model=ProjectDetail)
def put_scene_media(project_id: str, scene_id: str, data: MediaPlacementsUpdate, if_match: Annotated[str | None, Header()] = None):
    return call(media.write_placements, project_id, data, revision(if_match), scene_id)


@router.get("/api/projects/{project_id}/shared-media")
def get_shared_media(project_id: str):
    call(storage.read_project, project_id)
    return media.list_shared()


@router.post("/api/projects/{project_id}/assets/{asset_id}/share", status_code=201)
def publish_shared_media(project_id: str, asset_id: str):
    from .main import get_authorization_policy
    from .platform import get_actor_context
    if not get_authorization_policy().allows(get_actor_context(), "admin.policy.manage"):
        raise HTTPException(403, "An installation administrator must approve publishing to the shared library")
    return call(media.publish_shared, project_id, asset_id)


@router.post("/api/projects/{project_id}/shared-media/{shared_id}/copy", response_model=ProjectDetail)
def copy_shared_media(project_id: str, shared_id: str, if_match: Annotated[str | None, Header()] = None):
    return call(media.copy_shared, project_id, shared_id, revision(if_match))


@router.delete("/api/projects/{project_id}/shared-media/{shared_id}")
def delete_shared_media(project_id: str, shared_id: str):
    from .main import get_authorization_policy
    from .platform import get_actor_context
    if not get_authorization_policy().allows(get_actor_context(), "admin.policy.manage"):
        raise HTTPException(403, "An installation administrator must remove shared media")
    with storage.storyboard_transaction():
        path, record = call(media.shared_record, shared_id)
        # Withdraw listing only. Existing project copies and immutable history survive.
        (path / "record.json").rename(path / "withdrawn.json")
    return {"removed": True, "projectCopiesUnchanged": True}


class OcrRequest(BaseModel):
    expectedVersion: str = Field(min_length=1, max_length=100)
    language: str = Field(default="eng", pattern=r"^[a-zA-Z0-9_]+$", max_length=40)


@router.post("/api/projects/{project_id}/reference-resources/{resource_id}/ocr")
def post_reference_ocr(project_id: str, resource_id: str, data: OcrRequest):
    return call(ocr.run_reference_ocr, project_id, resource_id, data.expectedVersion, data.language)


@router.post("/api/projects/{project_id}/reference-resources/{resource_id}/ocr/accept")
def post_reference_ocr_accept(project_id: str, resource_id: str, data: OcrRequest):
    return call(ocr.accept_reference_ocr, project_id, resource_id, data.expectedVersion)
