import os
import unittest
from unittest.mock import patch

from backend.app.consultation_capacity import DEFAULTS, negotiate
from backend.app import pythia_hosted as hosted
from backend.app import pythia_talk as talk
from backend.tests.test_pythia_hosted import HOSTED_ENV


class ConsultationCapacityTests(unittest.TestCase):
    def test_source_text_from_a_failed_turn_is_not_deduplicated_out_of_retry(self):
        question = 'Plan this.\n<authoring-context>\nComplete source text.\n</authoring-context>'
        failed = [{'message_id': 'failed-user', 'role': 'user', 'content': question}]
        self.assertEqual(talk._hosted_question(failed, question), question)
        completed = [*failed, {'message_id': 'answer', 'role': 'assistant', 'content': 'Advice.'}]
        self.assertIn('Identical supplied context is included earlier', talk._hosted_question(completed, question))
        self.assertEqual(completed[0]['content'], question)

    def test_new_capacity_and_operator_override_cannot_exceed_engine(self):
        self.assertEqual(negotiate(DEFAULTS)['contextChars'], 200000)
        with patch.dict(os.environ, {'CHIMERA_PYTHIA_CONTEXT_CHARS': '50000'}):
            self.assertEqual(negotiate(DEFAULTS)['contextChars'], 50000)
        with patch.dict(os.environ, {'CHIMERA_PYTHIA_CONTEXT_CHARS': '400000'}):
            self.assertEqual(negotiate(DEFAULTS)['contextChars'], 200000)

    def test_legacy_engine_stays_at_its_real_capacity(self):
        value = negotiate(None)
        self.assertEqual(value['contextChars'], 24000)
        self.assertEqual(value['requestBytes'], 262144)
        self.assertFalse(value['verified'])

    def test_bad_settings_and_incomplete_metadata_are_rejected(self):
        for value in ('0', '-1', 'all', '2000001', '１２３４５'):
            with self.subTest(value=value), patch.dict(os.environ, {'CHIMERA_PYTHIA_CONTEXT_CHARS': value}):
                with self.assertRaises(ValueError):
                    negotiate(DEFAULTS)
        for metadata in ({}, {**DEFAULTS, 'contextChars': True}, {**DEFAULTS, 'tokenCounting': 'conservative-utf8-bytes'}):
            with self.subTest(metadata=metadata), self.assertRaises(ValueError):
                negotiate(metadata)

    def test_discovery_is_cached_and_refreshable_and_cannot_expose_credentials(self):
        with patch.dict(os.environ, HOSTED_ENV, clear=True), patch.dict(hosted._CAPACITY_CACHE, {}, clear=True):
            config = hosted.configuration()
            with patch.object(hosted, '_capabilities', return_value={'consultationLimits': dict(DEFAULTS)}) as discovery:
                self.assertEqual(hosted.limits(config)['contextChars'], 200000)
                self.assertEqual(hosted.limits(config)['contextChars'], 200000)
                self.assertEqual(discovery.call_count, 1)
                result = hosted.check(config)
                self.assertEqual(discovery.call_count, 2)
                self.assertNotIn(config.service_token, str(result))
                self.assertNotIn(config.callback_token, str(result))

    def test_warning_and_byte_capacity_include_unicode_and_json_escaping(self):
        allowance = negotiate(DEFAULTS)
        usage = hosted.measure(allowance, {}, 0, [], 'a' * 80000)
        self.assertEqual(usage['status'], 'warning')
        self.assertEqual(usage['used']['messageChars'], 80000)
        value = '\U0001f600' * 10000 + '"' * 10000
        measured = hosted.measure(allowance, {}, 0, [], value)
        self.assertGreater(measured['used']['requestBytes'], len(value.encode('utf-8')))

    def test_model_budget_is_visible_and_rejects_before_submit(self):
        allowance = negotiate({**DEFAULTS, 'modelContextTokens': 16000, 'outputTokens': 4096,
            'safetyTokens': 1024, 'modelFixedInputBytes': 3000, 'tokenCounting': 'conservative-utf8-bytes'})
        usage = hosted.measure(allowance, {}, 0, [], 'a' * 12000)
        self.assertIn('modelInputTokens', usage['exceeded'])
        self.assertEqual(usage['status'], 'full')
        self.assertEqual(allowance['modelInputTokens'], 10880)
