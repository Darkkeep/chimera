#!/usr/bin/env bash
# Container entrypoint: mount an exact-SHA artifact directory and synthetic test inputs read-only.
set -euo pipefail
sha=${1:?source SHA required}
studio=${2:?Studio build flag required}
[[ $sha =~ ^[0-9a-f]{40}$ && $studio =~ ^(true|false)$ ]]
archive="chimera-$sha-studio-$studio.tar.gz"
(cd /artifact && sha256sum --strict -c SHA256SUMS)
mkdir /tmp/candidate
cd /tmp/candidate
tar xzf "/artifact/$archive"
bash scripts/release/offline-install.sh /tmp/venv
export PATH="/tmp/venv/bin:$PWD/runtime/node/bin:$PATH" PLAYWRIGHT_BROWSERS_PATH="$PWD/runtime/browser"
export CHIMERA_WORKSPACE=/tmp/qualification-workspace PYTHONDONTWRITEBYTECODE=1
python - "$sha" "$studio" <<'PY'
import json, platform, sys
from pathlib import Path
manifest = json.loads(Path("release-manifest.json").read_text())
identity = json.loads(Path("frontend/dist/release-version.json").read_text())
assert Path(sys.base_prefix).resolve() == Path("runtime/python").resolve()
assert platform.python_version() == manifest["python"] == "3.14.4"
for record in (manifest, identity):
    assert record["sourceSha"] == sys.argv[1]
    assert record["studioDefault"] is (sys.argv[2] == "true")
    assert record["studioEnabled"] is (sys.argv[2] == "true")
from backend.app import central_access, main
assert Path(central_access.__file__).resolve().is_relative_to(Path.cwd())
PY
[[ $(node --version) == v24.19.0 ]]
# Keep application imports in this extracted release. Add only test inputs to it.
cp -R /fixtures/backend-tests backend/tests
mkdir -p tests vendor/pythia-contracts
cp -R /fixtures/media tests/fixtures
cp -R /fixtures/schemas vendor/pythia-contracts/schemas
soffice --version
python - <<'PY'
from pathlib import Path
from tempfile import TemporaryDirectory
from pptx import Presentation
from backend.app.render import render_slides
with TemporaryDirectory() as temporary:
    root = Path(temporary)
    deck = Presentation()
    deck.slides.add_slide(deck.slide_layouts[0])
    deck.save(root / "test.pptx")
    slides, error = render_slides(root / "test.pptx", root)
    assert error is None and (root / slides[1]).read_bytes().startswith(b"\x89PNG"), error
PY
python -m unittest backend.tests.test_central_access backend.tests.test_darkrogue_auth backend.tests.test_owner_suite \
    backend.tests.test_authoring.AuthoringTests.test_document_embeds_current_composition_instead_of_source_preview \
    backend.tests.test_storyboard_flow.StoryboardFlowTests.test_representative_storyboard_exports_same_learner_content_to_both_scorm_profiles
python -m unittest discover -s backend/tests
