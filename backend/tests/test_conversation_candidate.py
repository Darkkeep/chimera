"""Opt-in qualification against an explicit unreleased public contracts checkout.

CHIMERA_CONVERSATION_CONTRACTS_ROOT selects the candidate; never silently replace
the pinned vendor or claim the sibling checkout is a published contract.
"""
import copy
import importlib.util
import json
import os
from pathlib import Path
import unittest

from jsonschema import Draft202012Validator
from referencing import Registry, Resource

from backend.app.conversation_boundary import (
    AuthoringBinding, SourceIdentity, validate_candidate_authoring_scope,
    validate_advice_return,
)


@unittest.skipUnless(os.environ.get("CHIMERA_CONVERSATION_CONTRACTS_ROOT"),
                     "Explicit unreleased conversation candidate path required")
class ConversationCandidateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = Path(os.environ["CHIMERA_CONVERSATION_CONTRACTS_ROOT"])
        registry = Registry()
        cls.schemas = {}
        for path in (cls.root / "schemas").glob("conversation-*.schema.json"):
            schema = json.loads(path.read_text(encoding="utf-8"))
            cls.schemas[path.name] = schema
            registry = registry.with_resource(schema["$id"], Resource.from_contents(schema))
        cls.registry = registry
        # Public contracts semantic verifier, not a Pythia engine import.
        spec = importlib.util.spec_from_file_location(
            "public_conversation_semantics", cls.root / "scripts/conversation_semantics.py")
        cls.semantics = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.semantics)

    def setUp(self):
        self.request = json.loads((self.root / "examples/conversation-turn-request.valid.json")
                                  .read_text(encoding="utf-8"))
        self.operation = json.loads((self.root / "examples/conversation-operation.valid.json")
                                    .read_text(encoding="utf-8"))
        self.request["scope"]["consumer_id"] = "chimera"
        self.operation["scope"] = copy.deepcopy(self.request["scope"])
        self.operation["request_sha256"] = self.semantics.request_digest(self.request)
        scope = self.request["scope"]
        self.binding = AuthoringBinding(
            scope["tenant_id"], scope["actor_id"], scope["session_id"],
            "dispatch-demo", "night-handoff", "scene-3",
            tuple(SourceIdentity(s["source_id"], s["version"], s["content_sha256"])
                  for s in self.request["context"]["source_snapshots"]))

    def errors(self, name, value):
        return list(Draft202012Validator(self.schemas[name], registry=self.registry).iter_errors(value))

    def scope_check(self, request=None):
        validate_candidate_authoring_scope(request or self.request, self.binding,
                                           lambda *_: True, policy_revision="policy-1")

    def test_chimera_public_candidate_and_local_return_binding(self):
        self.assertEqual(self.errors("conversation-turn-request.schema.json", self.request), [])
        self.assertEqual(self.errors("conversation-operation.schema.json", self.operation), [])
        self.assertEqual(self.semantics.operation_errors(self.operation, self.request), [])
        self.scope_check()
        self.assertEqual(self.operation["result"]["stopping_boundary"], "advisory-only")
        validate_advice_return(self.binding, self.binding, self.binding,
                              lambda *_: True, applies_storyboard_edit=False)

    def test_each_foreign_scope_field_fails_local_authoring_mapping(self):
        for field in self.request["scope"]:
            request = copy.deepcopy(self.request)
            request["scope"][field] = "foreign"
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.scope_check(request)

    def test_changed_source_and_unavailable_export_fail_mapping(self):
        for field, value in (("source_id", "other"), ("version", "2"),
                             ("content_sha256", "c" * 64), ("media_type", "video/mp4")):
            request = copy.deepcopy(self.request)
            request["context"]["source_snapshots"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.scope_check(request)
        self.request["requested_outputs"] = ["pdf"]
        with self.assertRaises(ValueError):
            self.scope_check()

    def test_public_semantics_reject_changed_extraction_hash_and_coverage(self):
        for mutation in ("hash", "coverage"):
            operation = copy.deepcopy(self.operation)
            citation = operation["result"]["citations"][0]
            if mutation == "hash":
                citation["extraction_sha256"] = "c" * 64
            else:
                citation["span"]["end"] = 100
            operation["result"]["answer_sha256"] = self.semantics.digest(
                {k: v for k, v in operation["result"].items() if k != "answer_sha256"})
            with self.subTest(mutation=mutation):
                self.assertIn("citation outside exact source coverage",
                              self.semantics.operation_errors(operation, self.request))

    def test_public_schema_rejects_edit_boundary(self):
        self.operation["result"]["stopping_boundary"] = "edit-approved"
        self.assertTrue(self.errors("conversation-operation.schema.json", self.operation))


if __name__ == "__main__":
    unittest.main()
