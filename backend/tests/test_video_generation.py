import io
import json
import os
import tempfile
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import Mock, patch
from zipfile import ZipFile

from pydantic import SecretStr, ValidationError

from backend.app import ai_connection, main, media, media_generation, narration_connections, storage, video_generation
from backend.app.models import AssetMetadataUpdate, EnhancementProposalChangeCreate, EnhancementProposalCreate, MediaGenerationJobCreate, ProjectCreate, SceneCreate
from backend.app.standalone import build_standalone_course


class VideoGenerationTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.enterContext(patch.dict(os.environ, {}, clear=True))
        for module in (storage, main):
            self.enterContext(patch.object(module, "ROOT", self.root))
        self.enterContext(patch.object(storage, "PROJECTS", self.root / "projects"))
        backend = Mock()
        backend.get_password.return_value = "fixture-video-secret"
        self.enterContext(patch.object(ai_connection, "_secure_backend", return_value=backend))
        self.enterContext(patch.object(video_generation.time, "sleep"))
        self.enterContext(patch.object(video_generation.socket, "getaddrinfo", return_value=[
            (2, 1, 6, "", ("8.8.8.8", 443)),
        ]))
        self.project = storage.create_project(ProjectCreate(title="Video integration"))
        self.project = storage.create_scene(self.project.id, SceneCreate(title="Video scene"))
        self.scene_id = self.project.storyboard.scenes[0].id
        self.mp4 = (Path(__file__).parents[2] / "tests" / "fixtures" / "media-qualification.mp4").read_bytes()

    def save(self, provider="shotstack", environment="stage"):
        narration_connections.save_narration_connection(self.root, narration_connections.NarrationConnectionUpdate(
            expectedRevision=narration_connections.narration_status(self.root)["revision"],
            name=provider, provider=provider, environment=environment, credentialSource="secure-store", apiKey=SecretStr("fixture-video-secret"),
        ))
        return narration_connections.narration_status(self.root)["connections"][-1]

    def job(self, provider="shotstack", environment="stage", **overrides):
        connection = self.save(provider, environment)
        data = {"connectionId": connection["id"], "kind": "video", "sceneId": self.scene_id,
                "purpose": "Explain a process", "prompt": "The process", "width": 1280, "height": 720,
                "durationSeconds": 30, "script": "Inspect the valve.", "avatar": "authorized_avatar"}
        data.update(overrides)
        return storage.create_media_generation_job(self.project.id, MediaGenerationJobCreate(**data))

    def response(self, document):
        raw = json.dumps(document).encode() if isinstance(document, dict) else document
        response = Mock()
        response.read.side_effect = lambda limit: raw[:limit]
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        return response

    def transport(self, provider, *, status=None, duration="12.25", url="https://cdn.shotstack.io/clip.mp4"):
        submitted = {"id": "render-123"}
        pending = {"id": "render-123", "status": "in_progress" if provider == "synthesia" else "rendering"}
        finished = {"id": "render-123", "status": status or ("complete" if provider == "synthesia" else "done"),
                    "download": url, "url": url, "duration": duration}
        wrap = lambda value: value if provider == "synthesia" else {"success": True, "response": value}
        return patch.object(ai_connection, "open_provider_request", side_effect=[
            self.response(wrap(submitted)), self.response(wrap(pending)), self.response(wrap(finished)), self.response(self.mp4),
        ])

    def test_shotstack_30_second_payload_environment_auth_and_single_budget_unit(self):
        for environment in ("stage", "v1"):
            with self.subTest(environment=environment):
                job = self.job(environment=environment)
                with self.transport("shotstack") as transport:
                    media_generation._run_job(job.projectId, job.id)
                finished = storage.read_media_generation_job(job.projectId, job.id)
                self.assertEqual(finished.status, "completed", finished.error)
                self.assertEqual(finished.providerOperationId, "render-123")
                requests = [call.args[1] for call in transport.call_args_list]
                self.assertEqual(requests[0].full_url, f"https://api.shotstack.io/edit/{environment}/render")
                self.assertEqual(requests[0].get_header("X-api-key"), "fixture-video-secret")
                payload = json.loads(requests[0].data)
                clip = payload["timeline"]["tracks"][0]["clips"][0]
                self.assertEqual(clip["length"], 30)
                self.assertEqual(clip["asset"]["type"], "rich-text")
                self.assertEqual(clip["asset"]["text"], "The process")
                self.assertEqual(payload["output"], {"format": "mp4", "resolution": "hd", "aspectRatio": "16:9"})
                self.assertEqual(requests[1].full_url, f"https://api.shotstack.io/edit/{environment}/render/render-123")
                self.assertTrue(all(request.data is None for request in requests[1:]))
                self.assertNotIn("X-api-key", dict(requests[-1].header_items()))
                self.assertNotIn("Authorization", dict(requests[-1].header_items()))
        usage = json.loads((self.root / "identity" / "ai-usage.json").read_text())
        self.assertEqual(usage["requests"], 2)

    def test_synthesia_private_script_avatar_receipt_and_actual_duration(self):
        job = self.job("synthesia")
        with self.transport("synthesia", url="https://cdn.synthesia.io/clip.mp4") as transport:
            media_generation._run_job(job.projectId, job.id)
        finished = storage.read_media_generation_job(job.projectId, job.id)
        self.assertEqual(finished.status, "completed", finished.error)
        self.assertEqual(finished.durationSeconds, 30)
        self.assertEqual(finished.actualDurationSeconds, 12.25)
        request = transport.call_args_list[0].args[1]
        self.assertEqual(request.full_url, "https://api.synthesia.io/v2/videos")
        self.assertEqual(request.get_header("Authorization"), "fixture-video-secret")
        payload = json.loads(request.data)
        self.assertEqual(payload["visibility"], "private")
        self.assertEqual(payload["callbackId"], job.id)
        self.assertEqual(payload["input"], [{"avatar": "authorized_avatar", "background": "off_white", "scriptText": "Inspect the valve."}])
        self.assertTrue(transport.call_args_list[1].args[1].full_url.endswith("/videos/render-123?includeRejected=true"))
        candidate = storage.read_generated_candidate(job.projectId, finished.candidateIds[0])
        self.assertEqual(candidate.avatar, "authorized_avatar")
        self.assertEqual(candidate.actualDurationSeconds, 12.25)
        self.assertEqual(candidate.connectionId, job.connectionId)
        self.assertNotIn("fixture-video-secret", candidate.model_dump_json())
        self.assertNotIn("https://", finished.model_dump_json())

    def test_portrait_and_minimum_duration_payloads(self):
        for provider in ("shotstack", "synthesia"):
            with self.subTest(provider=provider):
                job = self.job(provider, width=720, height=1280, durationSeconds=4)
                with self.transport(provider, duration="4") as transport:
                    media_generation._run_job(job.projectId, job.id)
                finished = storage.read_media_generation_job(job.projectId, job.id)
                self.assertEqual(finished.status, "completed", finished.error)
                payload = json.loads(transport.call_args_list[0].args[1].data)
                if provider == "shotstack":
                    self.assertEqual(payload["output"]["aspectRatio"], "9:16")
                    clip = payload["timeline"]["tracks"][0]["clips"][0]
                    self.assertEqual((clip["width"], clip["height"], clip["length"]), (640, 1120, 4))
                else:
                    self.assertEqual(payload["aspectRatio"], "9:16")
                    self.assertEqual(finished.actualDurationSeconds, 4)

    def test_disconnected_connection_fails_queued_job_without_fallback(self):
        job = self.job()
        narration_connections.disconnect_narration_connection(
            self.root, job.connectionId, narration_connections.narration_status(self.root)["revision"],
        )
        with patch.object(ai_connection, "open_provider_request") as transport:
            media_generation._run_job(job.projectId, job.id)
        transport.assert_not_called()
        finished = storage.read_media_generation_job(job.projectId, job.id)
        self.assertEqual(finished.status, "failed")
        self.assertEqual(finished.candidateIds, [])
        self.assertFalse(main.get_media_generation_capability(job.projectId)["videoConfigured"])

    def test_video_only_capability_approval_placement_reload_and_standalone(self):
        job = self.job()
        capability = main.get_media_generation_capability(job.projectId)
        self.assertTrue(capability["providerConfigured"])
        self.assertTrue(capability["videoConfigured"])
        self.assertFalse(capability["imageConfigured"])
        self.assertEqual(capability["narrationConnections"], [])
        with self.transport("shotstack"):
            media_generation._run_job(job.projectId, job.id)
        finished = storage.read_media_generation_job(job.projectId, job.id)
        self.assertEqual(finished.status, "completed", finished.error)
        candidate, proposal, project = storage.approve_generated_candidate(job.projectId, finished.candidateIds[0], self.project.storyboard.revision)
        asset = project.storyboard.assets[-1]
        self.assertEqual(asset.kind, "video")
        self.assertEqual(proposal.changes[0].field, "videoAssets")
        _, project = storage.decide_enhancement_proposal(project.id, proposal.id, "accept", project.storyboard.revision)
        reloaded = storage.read_project(project.id)
        self.assertEqual(reloaded.storyboard.scenes[0].videoAssets, [asset.id])
        with self.assertRaisesRegex(ValueError, "captions and a transcript"):
            build_standalone_course(reloaded)
        reloaded = media.update_metadata(project.id, asset.id, AssetMetadataUpdate(
            transcript="The process",
            captionsVtt="WEBVTT\n\n00:00:00.000 --> 00:00:30.000\nThe process",
        ), reloaded.storyboard.revision)
        package, _ = build_standalone_course(reloaded)
        with ZipFile(io.BytesIO(package)) as archive:
            self.assertEqual(archive.read(asset.path), self.mp4)
        self.assertEqual(candidate.status, "approved")

    def test_video_placement_proposal_validates_asset_membership_and_type(self):
        project = storage.add_project_asset(self.project.id, "not-video.png", b"fixture", "image")
        for asset_id in ("missing-video", project.storyboard.assets[-1].id):
            proposal = storage.create_enhancement_proposal(project.id, EnhancementProposalCreate(
                changes=[EnhancementProposalChangeCreate(targetSceneId=self.scene_id, field="videoAssets", proposedValue=[asset_id])],
                rationale="Test media validation",
            ))
            with self.assertRaises(storage.EnhancementProposalConflict):
                storage.decide_enhancement_proposal(project.id, proposal.id, "accept", project.storyboard.revision)
        self.assertEqual(storage.read_project(project.id).storyboard.scenes[0].videoAssets, [])

    def test_synthesia_requires_script_and_avatar_before_any_render(self):
        for missing in ({"script": ""}, {"avatar": ""}):
            with self.subTest(missing=missing), self.assertRaisesRegex(ValueError, "script.*avatar"):
                self.job("synthesia", **missing)
        self.assertEqual(storage.list_media_generation_jobs(self.project.id), [])

    def test_duration_boundaries_and_retired_or_unconfigured_connections(self):
        for seconds in (4, 30):
            self.assertEqual(self.job(durationSeconds=seconds).durationSeconds, seconds)
        for seconds in (3, 31):
            with self.assertRaises(ValidationError):
                MediaGenerationJobCreate(kind="video", sceneId=self.scene_id, purpose="Test", prompt="Title", durationSeconds=seconds)
        for identifier in ("pythia", "legacy-openai"):
            with self.assertRaises(ValueError):
                storage.create_media_generation_job(self.project.id, MediaGenerationJobCreate(
                    kind="video", connectionId=identifier, sceneId=self.scene_id, purpose="Test", prompt="Title",
                ))

    def test_oversized_or_invalid_presenter_duration_is_rejected_without_download(self):
        for duration in ("30.01", "0:00:30.000001", "0:01:00", "0:00:99", "NaN", "0", "invalid", None, True):
            with self.subTest(duration=duration):
                job = self.job("synthesia")
                with self.transport("synthesia", duration=duration) as transport:
                    media_generation._run_job(job.projectId, job.id)
                finished = storage.read_media_generation_job(job.projectId, job.id)
                self.assertEqual(finished.status, "failed")
                self.assertIn("duration", finished.error)
                self.assertEqual(finished.providerOperationId, "render-123")
                self.assertEqual(transport.call_count, 3)
                self.assertEqual(finished.candidateIds, [])

    def test_presenter_duration_accepts_seconds_and_clock_format_at_30_second_boundary(self):
        for duration in ("30", "0:00:30.000000", "0:00:12.250000"):
            with self.subTest(duration=duration):
                job = self.job("synthesia")
                with self.transport("synthesia", duration=duration):
                    media_generation._run_job(job.projectId, job.id)
                finished = storage.read_media_generation_job(job.projectId, job.id)
                self.assertEqual(finished.status, "completed", finished.error)
                self.assertEqual(finished.actualDurationSeconds, 12.25 if "12.25" in duration else 30)

    def test_rejection_does_not_download_or_resubmit(self):
        job = self.job("synthesia")
        with self.transport("synthesia", status="rejected") as transport:
            media_generation._run_job(job.projectId, job.id)
        finished = storage.read_media_generation_job(job.projectId, job.id)
        self.assertEqual(finished.status, "failed")
        self.assertIn("rejected", finished.error)
        self.assertEqual(transport.call_count, 3)

    def test_revision_change_fails_before_network_and_no_fallback(self):
        job = self.job()
        job = storage.update_media_generation_job(job.projectId, job.id, aiConnectionRevision="obsolete")
        with patch.object(ai_connection, "open_provider_request") as transport:
            media_generation._run_job(job.projectId, job.id)
        transport.assert_not_called()
        self.assertEqual(storage.read_media_generation_job(job.projectId, job.id).status, "failed")

    def test_download_rejects_non_https_foreign_hosts_private_addresses_and_redirects(self):
        job = self.job()
        connection = narration_connections.resolve_narration_connection(self.root, job.connectionId)
        for url in ("http://cdn.shotstack.io/a", "https://evil.example/a", "https://shotstack.io.evil.example/a",
                    "https://secret@cdn.shotstack.io/a", "https://cdn.shotstack.io:444/a",
                    "https://cdn.shotstack.io/a\r\ninjected", "https://cdn.shotstack.io/a#fragment"):
            with self.subTest(url=url), patch.object(ai_connection, "open_provider_request") as transport:
                with self.assertRaisesRegex(RuntimeError, "download location"):
                    video_generation._download(connection, url)
                transport.assert_not_called()
        with patch.object(video_generation.socket, "getaddrinfo", return_value=[(2, 1, 6, "", ("127.0.0.1", 443))]):
            with self.assertRaisesRegex(RuntimeError, "download location"):
                video_generation._download(connection, "https://cdn.shotstack.io/a")
        with patch.object(ai_connection, "open_provider_request", side_effect=urllib.error.HTTPError("https://cdn.shotstack.io/a", 302, "redirect", {}, None)):
            with self.assertRaisesRegex(RuntimeError, "download failed"):
                video_generation._download(connection, "https://cdn.shotstack.io/a")

    def test_download_checks_size_and_mp4_signature(self):
        job = self.job()
        connection = narration_connections.resolve_narration_connection(self.root, job.connectionId)
        for data in (b"<html>not an MP4</html>", b""):
            with patch.object(ai_connection, "open_provider_request", return_value=self.response(data)):
                with self.assertRaisesRegex(RuntimeError, "supported MP4"):
                    video_generation._download(connection, "https://cdn.shotstack.io/a")
        with patch.object(video_generation, "MAX_VIDEO_BYTES", 12), patch.object(ai_connection, "open_provider_request", return_value=self.response(self.mp4)):
            with self.assertRaisesRegex(RuntimeError, "supported MP4"):
                video_generation._download(connection, "https://cdn.shotstack.io/a")

    def test_cancellation_timeout_and_restart_do_not_submit_another_render(self):
        job = self.job()
        provider = video_generation.VideoProvider(job)
        with self.transport("shotstack") as transport, patch.object(video_generation.time, "monotonic", side_effect=[0, 1201]):
            with self.assertRaisesRegex(RuntimeError, "timed out"):
                provider.generate_video(job)
            self.assertEqual(transport.call_count, 1)
        job = storage.update_media_generation_job(job.projectId, job.id, status="running")
        with patch.object(media_generation, "start_media_generation_job") as start:
            media_generation.recover_media_generation_jobs()
        start.assert_not_called()
        recovered = storage.read_media_generation_job(job.projectId, job.id)
        self.assertEqual(recovered.status, "failed")
        self.assertEqual(recovered.providerOperationId, "render-123")
        cancelled = self.job()
        storage.update_media_generation_job(cancelled.projectId, cancelled.id, cancelRequested=True)
        with patch.object(ai_connection, "open_provider_request") as transport:
            media_generation._run_job(cancelled.projectId, cancelled.id)
        transport.assert_not_called()
        self.assertEqual(storage.read_media_generation_job(cancelled.projectId, cancelled.id).status, "cancelled")

    def test_running_cancellation_stops_polling_and_preserves_receipt(self):
        job = self.job()
        def cancel(_seconds):
            media_generation.cancel_media_generation_job(job.projectId, job.id)
        with self.transport("shotstack") as transport, patch.object(video_generation.time, "sleep", side_effect=cancel):
            media_generation._run_job(job.projectId, job.id)
        self.assertEqual(transport.call_count, 2)
        finished = storage.read_media_generation_job(job.projectId, job.id)
        self.assertEqual(finished.status, "cancelled")
        self.assertEqual(finished.providerOperationId, "render-123")
        self.assertIn("remote", finished.message)
        self.assertEqual(finished.candidateIds, [])

    def test_retry_and_regeneration_preserve_provider_avatar_and_requested_limit(self):
        job = self.job("synthesia")
        with self.transport("synthesia"):
            media_generation._run_job(job.projectId, job.id)
        finished = storage.read_media_generation_job(job.projectId, job.id)
        with patch.object(media_generation, "start_media_generation_job"):
            regenerated = media_generation.regenerate_candidate(job.projectId, finished.candidateIds[0])
            storage.update_media_generation_job(job.projectId, regenerated.id, status="failed", providerOperationId="old-render")
            retried = media_generation.retry_media_generation_job(job.projectId, regenerated.id)
        for request in (regenerated, retried):
            self.assertEqual(request.avatar, "authorized_avatar")
            self.assertEqual(request.connectionId, job.connectionId)
            self.assertEqual(request.script, job.script)
            self.assertEqual(request.durationSeconds, 30)
            self.assertIsNone(request.providerOperationId)

    def test_mismatched_and_unknown_render_statuses_fail_without_download(self):
        for result in ({"id": "wrong", "status": "done"}, {"id": "render-123", "status": "unexpected"}):
            job = self.job()
            with patch.object(video_generation, "_document", side_effect=[{"id": "render-123"}, result]), patch.object(video_generation, "_download") as download:
                media_generation._run_job(job.projectId, job.id)
            download.assert_not_called()
            self.assertEqual(storage.read_media_generation_job(job.projectId, job.id).status, "failed")

    def test_render_metadata_and_network_failures_are_explicit_and_never_resubmitted(self):
        for result in ({}, {"success": False, "response": {}}, {"success": True, "response": {"id": "../escape"}}):
            job = self.job()
            with patch.object(ai_connection, "open_provider_request", return_value=self.response(result)) as transport:
                media_generation._run_job(job.projectId, job.id)
            self.assertEqual(transport.call_count, 1)
            self.assertEqual(storage.read_media_generation_job(job.projectId, job.id).status, "failed")
        job = self.job()
        with patch.object(ai_connection, "open_provider_request", side_effect=urllib.error.URLError("fixture-video-secret")) as transport:
            media_generation._run_job(job.projectId, job.id)
        finished = storage.read_media_generation_job(job.projectId, job.id)
        self.assertEqual(finished.status, "failed")
        self.assertNotIn("fixture-video-secret", finished.error)
        self.assertEqual(transport.call_count, 1)


if __name__ == "__main__":
    unittest.main()
