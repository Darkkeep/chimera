import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx


CHIMERA_ROOT = Path(__file__).resolve().parents[2]
PYTHIA_ROOT = Path(os.environ.get("PYTHIA_ROOT", CHIMERA_ROOT.parent / "Pythia")).resolve()
GOLDEN_PATH_TEST = "backend.tests.test_learning_intelligence.PythiaRouteTests.test_live_pythia_golden_path_imports_reviews_transforms_assesses_and_exports"


def start_engine(workspace):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    state_directory = workspace / "pythia-state"
    state_directory.mkdir()
    log_path = workspace / "pythia-engine.log"
    environment = {
        **os.environ,
        "PYTHIA_REQUIRE_AUTH": "false",
        "PYTHIA_API_CLIENTS": "[]",
        "PYTHIA_ENGINE_STATE_DIR": str(state_directory),
    }
    log = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "service.app:create_app", "--factory", "--host", "127.0.0.1", "--port", str(port)],
        cwd=PYTHIA_ROOT,
        env=environment,
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    log.close()
    base_url = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if process.poll() is not None:
            break
        try:
            response = httpx.get(f"{base_url}/health", timeout=0.5)
            if response.status_code == 200:
                return process, base_url, log_path
        except httpx.RequestError:
            pass
        time.sleep(0.1)
    details = log_path.read_text(encoding="utf-8", errors="replace")[-4000:]
    stop_engine(process)
    raise RuntimeError(f"Pythia Engine did not start from {PYTHIA_ROOT}. Engine log:\n{details}")


def stop_engine(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)


def main():
    if not PYTHIA_ROOT.is_dir():
        raise RuntimeError(f"Pythia checkout was not found at {PYTHIA_ROOT}; set PYTHIA_ROOT to its repository root")
    with tempfile.TemporaryDirectory(prefix="chimera-sprint10-") as temporary:
        workspace = Path(temporary)
        process, engine_url, log_path = start_engine(workspace)
        environment = {
            **os.environ,
            "CHIMERA_PYTHIA_GOLDEN_PATH_INTEGRATION": "1",
            "CHIMERA_PYTHIA_BASE_URL": engine_url,
            "PYTHIA_ROOT": str(PYTHIA_ROOT),
        }
        try:
            result = subprocess.run(
                [sys.executable, "-m", "unittest", GOLDEN_PATH_TEST, "-v"],
                cwd=CHIMERA_ROOT,
                env=environment,
                check=False,
                timeout=180,
            )
        finally:
            stop_engine(process)
        if result.returncode and log_path.exists():
            print(log_path.read_text(encoding="utf-8", errors="replace")[-4000:], file=sys.stderr)
        raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()