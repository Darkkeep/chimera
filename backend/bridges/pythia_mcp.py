"""Run with Pythia's Python environment; stdout is bounded JSON, never logs."""
import asyncio
from datetime import timedelta
import json
import os
from pathlib import Path
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def exchange(payload):
    checkout = Path(sys.argv[1]).resolve()
    config = json.loads((checkout / "plugins/pythia/mcp.json").read_text(encoding="utf-8"))["mcpServers"]["pythia"]
    interpreter = checkout / ".venv/Scripts/python.exe"
    adapter = checkout / "scripts/pythia_chatgpt.py"
    # Reuse the installed, local plugin's supported adapter and provider-file
    # argument only. No browser-controlled commands, environment, or shell.
    args = config.get("args", [])
    if (Path(config["command"]).resolve() != interpreter.resolve() or
            len(args) != 3 or Path(args[0]).resolve() != adapter.resolve() or
            args[1] != "--provider-file" or not Path(args[2]).is_absolute()):
        raise ValueError("Unsupported local Pythia plugin configuration")
    parameters = StdioServerParameters(command=str(interpreter), args=args, cwd=str(checkout))
    with open(os.devnull, "w") as errors:
        async with stdio_client(parameters, errlog=errors) as (reader, writer):
            async with ClientSession(reader, writer, read_timeout_seconds=timedelta(seconds=75)) as session:
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
                else:
                    result = await session.call_tool("pythia_consult", {"question": payload["question"], "history": payload["history"]})
                if result.isError:
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
        raw = sys.stdin.buffer.read(262145)
        if len(raw) > 262144:
            raise ValueError("Request exceeds allowance")
        value = asyncio.run(exchange(json.loads(raw)))
        result = json.dumps({"ok": True, "result": value}, ensure_ascii=True)
        if len(result) > 262144:
            raise ValueError("Response exceeds allowance")
        print(result)
    except BaseException:
        print(json.dumps({"ok": False, "error": "Pythia could not complete the local consultation. Check its local provider configuration and retry explicitly."}))
        sys.exit(1)
