import json
import tempfile
import unittest
from pathlib import Path

from backend.bridges.pythia_mcp import plugin_parameters


class PluginConfigurationTests(unittest.TestCase):
    def setUp(self):
        base = Path(self.enterContext(tempfile.TemporaryDirectory()))
        self.plugin_root = base / "plugin-checkout"
        self.interpreter = self.plugin_root / ".venv/Scripts/python.exe"
        self.adapter = self.plugin_root / "scripts/pythia_chatgpt.py"
        for target in (self.interpreter, self.adapter):
            target.parent.mkdir(parents=True, exist_ok=True)
            target.touch()
        self.provider_file = base / "provider.json"
        self.config_path = base / "consultation-checkout/plugins/pythia/mcp.json"
        self.config_path.parent.mkdir(parents=True)

    def write(self, command=None, args=None):
        if args is None:
            args = [str(self.adapter), "--provider-file", str(self.provider_file)]
        self.config_path.write_text(json.dumps({"mcpServers": {"pythia": {
            "type": "stdio", "command": command or str(self.interpreter), "args": args}}}), encoding="utf-8")

    def test_provider_file_only_plugin_in_a_different_checkout_is_accepted(self):
        self.write()
        command, args, cwd = plugin_parameters(self.config_path)
        self.assertEqual(Path(command), self.interpreter)
        self.assertEqual(args, [str(self.adapter), "--provider-file", str(self.provider_file)])
        self.assertEqual(Path(cwd), self.plugin_root)

    def test_installed_media_plugin_arguments_are_accepted(self):
        self.write(args=[str(self.adapter), "--provider-file", str(self.provider_file),
                         "--media-url", "http://127.0.0.1:8002",
                         "--media-output-dir", str(self.plugin_root / "media-out")])
        command, args, cwd = plugin_parameters(self.config_path)
        self.assertEqual(Path(command), self.interpreter)
        self.assertIn("--media-url", args)
        self.assertEqual(Path(cwd), self.plugin_root)

    def test_non_loopback_media_url_is_rejected(self):
        for url in ("http://example.com:8002", "https://127.0.0.1:8002", "http://127.0.0.1", "http://user:pw@127.0.0.1:8002"):
            self.write(args=[str(self.adapter), "--provider-file", str(self.provider_file), "--media-url", url])
            with self.assertRaisesRegex(ValueError, "Unsupported local Pythia plugin configuration"):
                plugin_parameters(self.config_path)

    def test_missing_provider_file_argument_is_rejected(self):
        self.write(args=[str(self.adapter), "--media-url", "http://127.0.0.1:8002"])
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            plugin_parameters(self.config_path)

    def test_relative_paths_are_rejected(self):
        self.write(args=[str(self.adapter), "--provider-file", "provider.json"])
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            plugin_parameters(self.config_path)
        self.write(args=[str(self.adapter), "--provider-file", str(self.provider_file), "--media-output-dir", "media"])
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            plugin_parameters(self.config_path)

    def test_unknown_duplicate_or_dangling_options_are_rejected(self):
        for args in ([str(self.adapter), "--provider-file", str(self.provider_file), "--shell", "cmd"],
                     [str(self.adapter), "--provider-file", str(self.provider_file), "--provider-file", str(self.provider_file)],
                     [str(self.adapter), "--provider-file", str(self.provider_file), "--media-url"],
                     []):
            self.write(args=args)
            with self.assertRaisesRegex(ValueError, "Unsupported"):
                plugin_parameters(self.config_path)

    def test_command_must_be_the_plugin_checkouts_interpreter_running_its_adapter(self):
        self.write(command=str(self.plugin_root / "other.exe"))
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            plugin_parameters(self.config_path)
        elsewhere = self.plugin_root / "tools/anything.py"
        elsewhere.parent.mkdir(parents=True)
        elsewhere.touch()
        self.write(args=[str(elsewhere), "--provider-file", str(self.provider_file)])
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            plugin_parameters(self.config_path)

    def test_missing_interpreter_or_adapter_file_is_rejected(self):
        self.interpreter.unlink()
        self.write()
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            plugin_parameters(self.config_path)


if __name__ == "__main__":
    unittest.main()
