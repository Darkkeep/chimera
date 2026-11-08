"""Run with Pythia's Python environment; stdout is bounded JSON, never logs."""
import asyncio
from datetime import timedelta
import json
import os
import re
from pathlib import Path
import sys
from urllib.parse import urlsplit

MAX_BRIDGE_BYTES = 128 * 1024 * 1024
PLUGIN_OPTIONS = {"--provider-file", "--media-url", "--media-output-dir"}


class LocalContextLimitError(ValueError):
    pass


def _loopback_http_url(value):
    try:
        parsed = urlsplit(value)
        return (parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
                and bool(parsed.port) and not parsed.username and not parsed.password)
    except ValueError:
        return False


def plugin_parameters(config_path):
    """Validate the installed @Pythia plugin's operator-managed command.

    The mcp.json may point at the plugin's own Pythia checkout. Only that
    checkout's virtual-environment interpreter running scripts/pythia_chatgpt.py
    is accepted, with the explicit --provider-file argument and optionally the
    plugin's loopback --media-url and absolute --media-output-dir arguments.
    No browser-controlled commands, other executables, options, or shells.
    """
    config = json.loads(config_path.read_text(encoding="utf-8"))["mcpServers"]["pythia"]
    args = [str(value) for value in config.get("args", [])]
    try:
        adapter = Path(args[0]).resolve()
        root = adapter.parents[1]
        interpreter = root / ".venv/Scripts/python.exe"
        options = dict(zip(args[1::2], args[2::2], strict=True))
        supported = (Path(args[0]).is_absolute() and adapter.name == "pythia_chatgpt.py"
                     and adapter.parent.name == "scripts" and adapter.is_file()
                     and Path(config["command"]).resolve() == interpreter and interpreter.is_file()
                     and set(options) <= PLUGIN_OPTIONS and len(options) == (len(args) - 1) // 2
                     and Path(options["--provider-file"]).is_absolute()
                     and ("--media-output-dir" not in options or Path(options["--media-output-dir"]).is_absolute())
                     and ("--media-url" not in options or _loopback_http_url(options["--media-url"])))
    except (IndexError, KeyError, TypeError, ValueError, OSError):
        supported = False
    if not supported:
        raise ValueError("Unsupported local Pythia plugin configuration")
    return str(interpreter), args, str(root)


async def exchange(payload):
    from mcp import ClientSession, StdioServerParameters
    from mcp.client.stdio import stdio_client

    checkout = Path(sys.argv[1]).resolve()
    command = str(checkout / ".venv/Scripts/python.exe")
    args = [str(checkout / "scripts/pythia_chatgpt.py")]
    cwd = str(checkout)
    # Reuse the installed, local plugin's supported adapter and arguments only.
    config_path = checkout / "plugins/pythia/mcp.json"
    environment = None
    if config_path.is_file():
        command, args, cwd = plugin_parameters(config_path)
    else:
        provider = payload.pop("provider")
        names = {"PYTHIA_ANALYSIS_API_URL", "PYTHIA_ANALYSIS_API_KEY", "PYTHIA_ANALYSIS_MODEL"}
        if set(provider) != names or not all(isinstance(value, str) and value.strip() for value in provider.values()):
            raise ValueError("Incomplete saved AI connection")
        environment = dict(provider)
    parameters = StdioServerParameters(command=command, args=args, cwd=cwd, env=environment)
    with open(os.devnull, "w") as errors:
        async with stdio_client(parameters, errlog=errors) as (reader, writer):
            async with ClientSession(reader, writer, read_timeout_seconds=timedelta(seconds=630)) as session:
                await session.initialize()
                tools = await session.list_tools()
                if not {"pythia_capabilities", "pythia_consult"} <= {tool.name for tool in tools.tools}:
                    raise ValueError("Pythia consultation tools unavailable")
                capabilities = await session.call_tool("pythia_capabilities", {})
                if capabilities.isError:
                    raise ValueError("Pythia capabilities unavailable")
                if payload["action"] == "capabilities":
                    result = capabilities
                elif payload["action"] == "draft":
                    if "pythia_draft_changes" not in {tool.name for tool in tools.tools}:
                        raise ValueError("Update the local Pythia adapter to enable authoring drafts")
                    result = await session.call_tool("pythia_draft_changes", {"request": payload["request"]})
                elif payload["action"] == "video-treatment":
                    if "pythia_video_treatment" not in {tool.name for tool in tools.tools}:
                        raise ValueError("Update the local Pythia adapter to enable video treatments")
                    result = await session.call_tool("pythia_video_treatment", {"request": payload["request"]})
                elif payload["action"] == "experience-treatment":
                    if "pythia_experience_treatment" not in {tool.name for tool in tools.tools}:
                        raise ValueError("Update the local Pythia adapter to enable scene experiences")
                    result = await session.call_tool("pythia_experience_treatment", {"request": payload["request"]})
                elif payload["action"] == "storyboard-enhancement":
                    if "pythia_storyboard_enhancement" not in {tool.name for tool in tools.tools}:
                        raise ValueError("Update the local Pythia adapter to enable live storyboard suggestions")
                    result = await session.call_tool("pythia_storyboard_enhancement", {"request": payload["request"]})
                else:
                    result = await session.call_tool("pythia_consult", {"question": payload["question"], "history": payload["history"]})
                if result.isError:
                    for block in result.content:
                        if block.type == "text":
                            safe = re.search(r"PYTHIA_CONTEXT_LIMIT: ([0-9,]+ input tokens exceeds [0-9,]+ available tokens\. Select fewer sources or split the material; no text was dropped\.)", block.text)
                            if safe:
                                raise LocalContextLimitError(safe.group(1))
                    raise ValueError("Pythia consultation failed")
                value = result.structuredContent
                if value is None:
                    blocks = [block.text for block in result.content if block.type == "text"]
                    if len(blocks) != 1:
                        raise ValueError("Invalid Pythia result")
                    value = json.loads(blocks[0])
                return value


if __name__ == "__main__":
    try:
        raw = sys.stdin.buffer.read(MAX_BRIDGE_BYTES + 1)
        if len(raw) > MAX_BRIDGE_BYTES:
            raise ValueError("Request exceeds allowance")
        value = asyncio.run(exchange(json.loads(raw)))
        result = json.dumps({"ok": True, "result": value}, ensure_ascii=True)
        if len(result) > MAX_BRIDGE_BYTES:
            raise ValueError("Response exceeds allowance")
        print(result)
    except LocalContextLimitError as error:
        print(json.dumps({"ok": False, "errorCode": "context_limit", "error": str(error)}))
        sys.exit(1)
    except BaseException as error:
        # MCP's async task groups wrap tool failures in ExceptionGroup.
        pending = [error]
        while pending:
            cause = pending.pop()
            if isinstance(cause, LocalContextLimitError):
                print(json.dumps({"ok": False, "errorCode": "context_limit", "error": str(cause)}))
                sys.exit(1)
            pending.extend(getattr(cause, "exceptions", ()))
        print(json.dumps({"ok": False, "error": "Pythia could not complete the local consultation. Check its local provider configuration and retry explicitly."}))
        sys.exit(1)
