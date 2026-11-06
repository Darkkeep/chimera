"""Run with Pythia's Python environment; stdout is bounded JSON, never logs."""
import asyncio
from datetime import timedelta
import json
import os
import re
from pathlib import Path
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

MAX_BRIDGE_BYTES = 128 * 1024 * 1024


class LocalContextLimitError(ValueError):
    pass


async def exchange(payload):
    checkout = Path(sys.argv[1]).resolve()
    interpreter = checkout / ".venv/Scripts/python.exe"
    adapter = checkout / "scripts/pythia_chatgpt.py"
    # Reuse the installed, local plugin's supported adapter and provider-file
    # argument only. No browser-controlled commands, environment, or shell.
    config_path = checkout / "plugins/pythia/mcp.json"
    environment = None
    if config_path.is_file():
        config = json.loads(config_path.read_text(encoding="utf-8"))["mcpServers"]["pythia"]
        args = config.get("args", [])
        if (Path(config["command"]).resolve() != interpreter.resolve() or
            len(args) != 3 or Path(args[0]).resolve() != adapter.resolve() or
            args[1] != "--provider-file" or not Path(args[2]).is_absolute()):
            raise ValueError("Unsupported local Pythia plugin configuration")
    else:
        provider = payload.pop("provider")
        names = {"PYTHIA_ANALYSIS_API_URL", "PYTHIA_ANALYSIS_API_KEY", "PYTHIA_ANALYSIS_MODEL"}
        if set(provider) != names or not all(isinstance(value, str) and value.strip() for value in provider.values()):
            raise ValueError("Incomplete saved AI connection")
        environment = dict(provider)
        args = [str(adapter)]
    parameters = StdioServerParameters(command=str(interpreter), args=args, cwd=str(checkout), env=environment)
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
