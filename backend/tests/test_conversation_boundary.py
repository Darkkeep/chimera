import unittest
from dataclasses import replace
from unittest.mock import Mock

from backend.app.conversation_boundary import (
    AuthoringBinding, SourceIdentity, authorize_binding, validate_advice_return,
)


class ConversationBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.source = SourceIdentity("policy", "policy-1", "a" * 64)
        self.binding = AuthoringBinding("tenant-a", "actor-a", "session-a",
                                        "dispatch-demo", "night-handoff", "scene-3",
                                        (self.source,))

    def validate(self, returned=None, current=None, authorize=None, edit=False):
        validate_advice_return(self.binding, returned or self.binding,
                              current or self.binding, authorize or (lambda *_: True),
                              applies_storyboard_edit=edit)

    def test_advice_keeps_immutable_binding_and_checks_every_resource(self):
        policy = Mock(return_value=True)
        self.validate(authorize=policy)
        self.assertEqual([call.args for call in policy.call_args_list], [
            ("tenant-a", "actor-a", "chimera", "session", "session-a"),
            ("tenant-a", "actor-a", "chimera", "project", "dispatch-demo"),
            ("tenant-a", "actor-a", "chimera", "scene", "night-handoff"),
            ("tenant-a", "actor-a", "chimera", "source", "policy"),
        ])
        self.assertEqual(self.binding.scene_revision, "scene-3")

    def test_foreign_return_and_stale_authoring_state_are_rejected(self):
        mutations = dict(tenant_id="tenant-b", actor_id="actor-b", session_id="other",
                         project_id="foreign", scene_id="other", scene_revision="scene-4",
                         sources=())
        for field, value in mutations.items():
            for direction in ("returned", "current"):
                with self.subTest(field=field, direction=direction), self.assertRaises(ValueError):
                    self.validate(**{direction: replace(self.binding, **{field: value})})

    def test_source_version_hash_and_identity_cannot_be_substituted(self):
        for source in (replace(self.source, sha256="b" * 64),
                       replace(self.source, version="policy-2"),
                       replace(self.source, source_id="foreign")):
            for direction in ("returned", "current"):
                with self.subTest(source=source, direction=direction), self.assertRaises(ValueError):
                    self.validate(**{direction: replace(self.binding, sources=(source,))})

    def test_revocation_denies_each_resource_even_with_matching_ids(self):
        for denied in ("session", "project", "scene", "source"):
            with self.subTest(denied=denied), self.assertRaises(PermissionError):
                self.validate(authorize=lambda _t, _a, _c, kind, _id: kind != denied)

    def test_truthy_nonboolean_decision_does_not_grant_access(self):
        with self.assertRaises(PermissionError):
            authorize_binding(self.binding, lambda *_: "yes")

    def test_authorization_failure_does_not_expose_revision_conflict(self):
        with self.assertRaises(PermissionError):
            self.validate(current=replace(self.binding, scene_revision="secret"),
                          authorize=lambda *_: False)

    def test_policy_failure_propagates_without_fallback(self):
        with self.assertRaises(RuntimeError):
            self.validate(authorize=Mock(side_effect=RuntimeError("policy unavailable")))

    def test_advice_never_authorizes_an_edit(self):
        for edit in (True, None, 0, "false"):
            with self.subTest(edit=edit), self.assertRaises(ValueError):
                self.validate(edit=edit)

    def test_invalid_identity_and_mutable_or_duplicate_sources_are_rejected(self):
        for changes in ({"consumer": "manteion"}, {"actor_id": " "},
                        {"sources": [self.source]},
                        {"sources": (self.source, self.source)}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                replace(self.binding, **changes)
        for digest in ("A" * 64, "a" * 63, "z" * 64, "", None):
            with self.subTest(digest=digest), self.assertRaises(ValueError):
                replace(self.source, sha256=digest)


if __name__ == "__main__":
    unittest.main()
