import json
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import main, storage
from backend.app.auth import get_identity_provider
from backend.app.identity import LocalIdentityDirectory, OrganizationPolicy, ProjectMembership
from backend.app.models import ProjectCreate
from backend.app.password_auth import AccountStore, COOKIE, token_digest


class PasswordAuthTests(unittest.TestCase):
    def test_atomic_account_write_retries_transient_lock(self):
        replace = Path.replace
        attempts = []
        def briefly_locked(source, target):
            attempts.append(source)
            if len(attempts) == 1:
                raise PermissionError("temporary scanner lock")
            return replace(source, target)
        with patch.object(Path, "replace", briefly_locked):
            self.store._write(self.store._read())
        self.assertEqual(len(attempts), 2)
        self.assertEqual(list(self.store.path.parent.glob(".accounts-*.tmp")), [])

    def test_failed_atomic_write_preserves_accounts_and_cleans_temporary(self):
        original = self.store.path.read_bytes()
        with patch.object(Path, "replace", side_effect=PermissionError("locked")), patch("backend.app.password_auth.time.sleep"):
            with self.assertRaises(PermissionError):
                self.store._write({})
        self.assertEqual(self.store.path.read_bytes(), original)
        self.assertEqual(list(self.store.path.parent.glob(".accounts-*.tmp")), [])

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        for target in (storage, main):
            self.enterContext(patch.object(target, "ROOT", self.root))
        self.enterContext(patch.object(storage, "PROJECTS", self.root / "projects"))
        self.enterContext(patch.dict("os.environ", {"CHIMERA_DEPLOYMENT_PROFILE": "darkrogue", "CHIMERA_PUBLIC_ORIGIN": "https://darkrogue.io"}))
        self.store = AccountStore(self.root)
        self.password = "long test passphrase for hosted account"
        self.user_id = self.store.provision("author@example.com", self.password, "Hosted Author", ["administrator", "author"])
        self.client = TestClient(main.app, base_url="https://darkrogue.io")
        self.addCleanup(self.client.close)
        self.origin = {"Origin": "https://darkrogue.io"}

    def login(self, **kwargs):
        return self.client.post("/api/auth/login", json={"email": "AUTHOR@example.com", "password": self.password}, headers=self.origin, **kwargs)

    def test_login_identity_and_logout_revoke_session(self):
        self.assertEqual(self.client.get("/api/projects").status_code, 401)
        response = self.login()
        self.assertEqual(response.status_code, 200)
        cookie = response.headers["set-cookie"]
        for flag in ("HttpOnly", "Secure", "SameSite=strict", "Path=/"):
            self.assertIn(flag, cookie)
        token = self.client.cookies.get(COOKIE)
        data = self.store._read()
        self.assertNotIn(token, json.dumps(data))
        self.assertIn(token_digest(token), data["sessions"])
        identity = self.client.get("/api/identity/context").json()
        self.assertEqual(identity["actor"]["actorId"], self.user_id)
        self.assertEqual(identity["policy"]["identityProvider"], "builtin")
        self.assertEqual(self.client.get("/api/projects").status_code, 200)
        self.assertEqual(self.client.post("/api/auth/logout", headers=self.origin).status_code, 200)
        self.assertEqual(self.client.get("/api/projects", headers={"Cookie": f"{COOKIE}={token}"}).status_code, 401)

    def test_project_stage_requires_edit_access_and_health_preserves_review_access(self):
        self.assertEqual(self.login().status_code, 200)
        created = self.client.post("/api/projects", json={"title": "Stage permissions"}, headers=self.origin)
        self.assertEqual(created.status_code, 201)
        project_id = created.json()["id"]
        updated = self.client.patch(f"/api/projects/{project_id}/production-stage", json={"productionStage": "in-review"}, headers=self.origin)
        self.assertEqual(updated.status_code, 200)
        reviewer_id = self.store.provision("reviewer@example.com", self.password, "Reviewer", ["reviewer"])
        self.store.add_project_membership(ProjectMembership(projectId=project_id, userId=reviewer_id, role="reviewer"))
        login = self.client.post("/api/auth/login", json={"email": "reviewer@example.com", "password": self.password}, headers=self.origin)
        self.assertEqual(login.status_code, 200)
        health = self.client.get("/api/management/project-health")
        self.assertEqual(health.status_code, 200)
        self.assertEqual(health.json()[0]["productionStage"], "in-review")
        self.assertFalse(health.json()[0]["canEdit"])
        self.assertFalse(health.json()[0]["canSetStage"])
        denied = self.client.patch(f"/api/projects/{project_id}/production-stage", json={"productionStage": "published"}, headers=self.origin)
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(storage.read_project(project_id).productionStage, "in-review")

    def test_ai_connection_is_admin_only_and_validation_redacts_secrets(self):
        self.assertEqual(self.login().status_code, 200)
        self.assertEqual(self.client.get("/api/ai-connection").status_code, 200)
        self.assertTrue(self.client.get("/api/ai-connection").json()["canManage"])
        invalid = self.client.put("/api/ai-connection", json={"expectedRevision": "unconfigured", "apiKey": "redaction-test-only", "baseUrl": "http://127.0.0.1"}, headers=self.origin)
        self.assertEqual(invalid.status_code, 422)
        self.assertNotIn("redaction-test-only", invalid.text)
        author = self.store.provision("settings-author@example.com", self.password, "Settings author", ["author"])
        response = self.client.post("/api/auth/login", json={"email": "settings-author@example.com", "password": self.password}, headers=self.origin)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(self.client.get("/api/ai-connection").json()["canManage"])
        for method, path in (("put", "/api/ai-connection"), ("post", "/api/ai-connection/test"), ("post", "/api/ai-connection/disconnect")):
            denied = getattr(self.client, method)(path, json={"expectedRevision": "unconfigured"}, headers=self.origin)
            self.assertEqual(denied.status_code, 403)

    def test_bad_credentials_and_account_lookup_share_error(self):
        a = self.client.post("/api/auth/login", json={"email": "author@example.com", "password": "wrong"}, headers=self.origin)
        b = self.client.post("/api/auth/login", json={"email": "missing@example.com", "password": "wrong"}, headers=self.origin)
        self.assertEqual((a.status_code, a.json()), (b.status_code, b.json()))
        self.assertEqual(a.status_code, 401)
        self.assertNotIn(self.password, self.store.path.read_text())

    def test_login_and_mutation_require_exact_origin(self):
        self.assertEqual(self.client.post("/api/auth/login", json={"email": "author@example.com", "password": self.password}).status_code, 403)
        self.assertEqual(self.login().status_code, 200)
        for origin in ({}, {"Origin": "https://other.darkrogue.io"}):
            self.assertEqual(self.client.post("/api/projects", json={"title": "Forbidden"}, headers=origin).status_code, 403)
        self.assertEqual(self.client.post("/api/projects", json={"title": "Allowed"}, headers=self.origin).status_code, 201)

    def test_rate_limit_and_expiration(self):
        for _ in range(5):
            self.assertEqual(self.client.post("/api/auth/login", json={"email": "author@example.com", "password": "wrong"}, headers=self.origin).status_code, 401)
        self.assertEqual(self.login().status_code, 429)
        with patch("backend.app.password_auth.time.time", return_value=time.time()+901):
            self.assertEqual(self.login().status_code, 200)
        with patch("backend.app.password_auth.time.time", return_value=time.time()+36000):
            self.assertEqual(self.client.get("/api/projects").status_code, 401)

    def test_relogin_rotates_and_revokes_previous_token(self):
        self.login()
        old = self.client.cookies.get(COOKIE)
        self.login()
        new = self.client.cookies.get(COOKIE)
        self.assertNotEqual(old, new)
        self.assertNotIn(token_digest(old), self.store._read()["sessions"])

    def test_disabled_user_cannot_use_existing_session(self):
        self.login()
        data = self.store._read()
        data["accounts"]["author@example.com"]["disabled"] = True
        self.store._write(data)
        self.assertEqual(self.client.get("/api/projects").status_code, 401)

    def test_unassigned_reviewer_sees_no_projects(self):
        self.store.provision("reviewer@example.com", self.password, "Reviewer", ["reviewer"])
        self.client.post("/api/auth/login", json={"email": "reviewer@example.com", "password": self.password}, headers=self.origin)
        self.assertEqual(self.client.get("/api/projects").json(), [])
        self.assertEqual(self.client.get("/api/accounts").status_code, 403)

    def test_hosted_profile_cannot_be_downgraded_from_api(self):
        self.login()
        self.assertEqual(self.client.patch("/api/identity/policy", json=OrganizationPolicy().model_dump(), headers=self.origin).status_code, 409)

    def test_login_validation_never_echoes_password(self):
        secret = "secret-value"*100
        response = self.client.post("/api/auth/login", json={"email": "author@example.com", "password": secret}, headers=self.origin)
        self.assertEqual(response.status_code, 422)
        self.assertNotIn(secret, response.text)
        self.assertEqual(response.headers["cache-control"], "no-store")

    def test_auth_discovery_is_public_and_has_no_credentials(self):
        response = self.client.get("/api/auth/config")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"deploymentMode": "team", "identityProvider": "builtin", "passwordLoginAvailable": True})

    def test_project_membership_scopes_reads_and_reviewer_writes(self):
        self.login()
        project = self.client.post("/api/projects", json={"title": "Assigned"}, headers=self.origin).json()
        other = self.client.post("/api/projects", json={"title": "Other"}, headers=self.origin).json()
        scene = self.client.post(f'/api/projects/{project["id"]}/scenes', json={"title": "Review this"}, headers=self.origin).json()["storyboard"]["scenes"][0]
        reviewer = self.store.provision("reviewer@example.com", self.password, "Real Reviewer", ["reviewer"])
        response = self.client.post(f'/api/projects/{project["id"]}/members', json={"userId": reviewer, "role": "reviewer"}, headers=self.origin)
        self.assertEqual(response.status_code, 201)
        self.client.post("/api/auth/login", json={"email": "reviewer@example.com", "password": self.password}, headers=self.origin)
        self.assertEqual([p["id"] for p in self.client.get("/api/projects").json()], [project["id"]])
        self.assertEqual(self.client.get(f'/api/projects/{other["id"]}').status_code, 403)
        self.assertEqual(self.client.get(f'/api/projects/{other["id"]}/assets/missing').status_code, 403)
        self.assertEqual(self.client.post(f'/api/projects/{project["id"]}/scenes', json={"title": "Forbidden"}, headers=self.origin).status_code, 403)
        self.assertEqual(self.client.get(f'/api/projects/{project["id"]}/backup.zip').status_code, 403)
        self.assertEqual(self.client.get(f'/api/projects/{project["id"]}/members').status_code, 403)
        self.assertEqual(self.client.post(f'/api/projects/{project["id"]}/enhancement-proposals/fake/decision', json={"decision": "accept"}, headers={**self.origin, "If-Match": '"1"'}).status_code, 403)
        comment = self.client.post(f'/api/projects/{project["id"]}/review-comments', json={"sceneId": scene["id"], "authorLabel": "Spoofed", "body": "Review feedback"}, headers=self.origin)
        self.assertEqual(comment.status_code, 201)
        self.assertEqual(comment.json()["authorLabel"], "Real Reviewer")
        events = (storage.project_path(project["id"])/"audit/events.jsonl").read_text().splitlines()
        self.assertEqual(json.loads(events[-1])["actorId"], reviewer)
        self.assertEqual(self.client.get("/api/management/my-work").json()["actorId"], reviewer)

    def test_author_owns_created_project_without_organization_wide_access(self):
        self.login()
        other = self.client.post("/api/projects", json={"title": "Admin project"}, headers=self.origin).json()
        self.store.provision("writer@example.com", self.password, "Writer", ["author"])
        self.client.post("/api/auth/login", json={"email": "writer@example.com", "password": self.password}, headers=self.origin)
        own = self.client.post("/api/projects", json={"title": "My own"}, headers=self.origin)
        self.assertEqual(own.status_code, 201)
        self.assertEqual(len(self.client.get("/api/projects").json()), 1)
        self.assertEqual(self.client.get(f'/api/projects/{other["id"]}').status_code, 403)
        self.assertEqual(self.client.get(f'/api/projects/{own.json()["id"]}/permissions').json()["canEdit"], True)

    def test_reset_is_single_use_and_revokes_sessions(self):
        self.login()
        old = self.client.cookies.get(COOKIE)
        token = self.store.issue_reset("author@example.com")
        self.assertNotIn(token, self.store.path.read_text())
        replacement = "replacement password long enough"
        response = self.client.post("/api/auth/reset-password", json={"token": token, "password": replacement}, headers=self.origin)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/projects", headers={"Cookie": f"{COOKIE}={old}"}).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/reset-password", json={"token": token, "password": replacement}, headers=self.origin).status_code, 400)
        self.assertEqual(self.client.post("/api/auth/login", json={"email": "author@example.com", "password": replacement}, headers=self.origin).status_code, 200)

    def test_reset_expiry_and_last_admin_protection(self):
        token = self.store.issue_reset("author@example.com")
        with patch("backend.app.password_auth.time.time", return_value=time.time()+901):
            self.assertEqual(self.client.post("/api/auth/reset-password", json={"token": token, "password": self.password}, headers=self.origin).status_code, 400)
        with self.assertRaisesRegex(ValueError, "last active administrator"):
            self.store.change_account("author@example.com", disabled=True)

    def test_review_link_audience_expiry_revision_and_revocation(self):
        self.login()
        project = self.client.post("/api/projects", json={"title": "Review project"}, headers=self.origin).json()
        with patch.dict("os.environ", {"CHIMERA_REVIEW_ACCESS": "authenticated"}):
            invite = self.client.post(f'/api/projects/{project["id"]}/review-links', json={"userId": self.user_id, "expiresHours": 1}, headers=self.origin)
            self.assertEqual(invite.status_code, 201)
            token = invite.json()["url"].split("#review=")[1]
            headers = {**self.origin, "X-Review-Token": token}
            self.assertEqual(self.client.post("/api/reviews/access", headers=headers).status_code, 200)
            self.store.provision("unassigned@example.com", self.password, "Unassigned Reviewer", ["reviewer"])
            with TestClient(main.app, base_url="https://darkrogue.io") as outsider:
                outsider.post("/api/auth/login", json={"email": "unassigned@example.com", "password": self.password}, headers=self.origin)
                self.assertEqual(outsider.post("/api/reviews/access", headers=headers).status_code, 404)
            with patch("backend.app.password_auth.time.time", return_value=time.time()+3601):
                self.assertEqual(self.client.post("/api/reviews/access", headers=headers).status_code, 404)
            self.client.post(f'/api/projects/{project["id"]}/scenes', json={"title": "Changed"}, headers=self.origin)
            self.assertEqual(self.client.post("/api/reviews/access", headers=headers).status_code, 409)
            self.client.delete(f'/api/projects/{project["id"]}/review-links/{invite.json()["id"]}', headers=self.origin)
            self.assertEqual(self.client.post("/api/reviews/access", headers=headers).status_code, 404)
        self.assertEqual(self.client.post("/api/reviews/access", headers=headers).status_code, 404)

    def test_administrator_is_not_automatically_content_approver(self):
        self.login()
        project = storage.create_project(ProjectCreate(title="Unassigned content"))
        permissions = self.client.get(f'/api/projects/{project.id}/permissions').json()
        self.assertTrue(permissions["canManageMembers"])
        self.assertFalse(permissions["canApprove"])

    def test_membership_removal_revokes_project_and_review_link_access(self):
        self.login()
        project = self.client.post("/api/projects", json={"title": "Revoked project"}, headers=self.origin).json()
        reviewer = self.store.provision("revoked@example.com", self.password, "Reviewer", ["reviewer"])
        self.client.post(f'/api/projects/{project["id"]}/members', json={"userId": reviewer, "role": "reviewer"}, headers=self.origin)
        link = self.store.issue_review(project["id"], reviewer, project["storyboard"]["revision"], 1)
        self.client.delete(f'/api/projects/{project["id"]}/members/{reviewer}', headers=self.origin)
        self.client.post("/api/auth/login", json={"email": "revoked@example.com", "password": self.password}, headers=self.origin)
        self.assertEqual(self.client.get(f'/api/projects/{project["id"]}').status_code, 403)
        with patch.dict("os.environ", {"CHIMERA_REVIEW_ACCESS": "authenticated"}):
            self.assertEqual(self.client.post("/api/reviews/access", headers={**self.origin, "X-Review-Token": link["url"].split("#review=")[1]}).status_code, 404)

    def test_encarta_remains_closed_even_with_endpoint(self):
        with patch.dict("os.environ", {"CHIMERA_DEPLOYMENT_PROFILE": "encarta", "CHIMERA_ENCARTA_URL": "https://encarta.example"}):
            response = self.client.get("/api/projects")
        self.assertEqual(response.status_code, 503)
        self.assertIn("validation", response.json()["detail"])

    def test_unimplemented_providers_do_not_fall_back_to_local(self):
        for name in ("oidc", "saml", "adapter"):
            LocalIdentityDirectory(self.root).update_policy(OrganizationPolicy(deploymentMode="team", identityProvider=name))
            with patch.dict("os.environ", {"CHIMERA_DEPLOYMENT_PROFILE": ""}):
                # Empty is invalid, so remove the setting to use stored policy.
                import os
                del os.environ["CHIMERA_DEPLOYMENT_PROFILE"]
                with self.assertRaisesRegex(RuntimeError, "not implemented"):
                    get_identity_provider().resolve(None)
