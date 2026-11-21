#!/usr/bin/env bash
# Build an immutable release payload from tracked source. Never contacts a host.
set -euo pipefail

if [[ $# != 2 || ! "$1" =~ ^[0-9a-f]{40}$ || ! "$2" =~ ^(true|false)$ ]]; then
    echo "Usage: $0 FULL_COMMIT_SHA STUDIO_ENABLED(true|false)" >&2
    exit 2
fi

sha=$1
studio=$2
root=$(git rev-parse --show-toplevel)
cd "$root"
[[ "$(git rev-parse --verify "$sha^{commit}")" == "$sha" ]]
epoch=$(git show -s --format=%ct "$sha")
stamp=$(date -u -d "@$epoch" +%Y-%m-%dT%H:%M:%SZ)
contract=$(git rev-parse "$sha:vendor/pythia-contracts")
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
mkdir "$scratch/src"
git archive "$sha" -- frontend docs/user-guide.pdf backend/app backend/bridges backend/requirements.txt \
    package.json package-lock.json vendor/onboarding scripts/render-authored-scenes.cjs \
    LICENSE THIRD_PARTY_NOTICES.md Multimedia_Instructional_Storyboard_Template.docx \
    Visual_Slide_Storyboard_Template.pptx | tar -x -C "$scratch/src"

(
    cd "$scratch/src"
    unset NODE_ENV
    npm ci --prefix frontend
    VITE_CHIMERA_STUDIO_ENABLED="$studio" VITE_CHIMERA_STUDIO_DEFAULT="$studio" VITE_CHIMERA_BUILD_SHA="$sha" \
        VITE_CHIMERA_BUILD_TIMESTAMP="$stamp" VITE_CHIMERA_BUILD_ENVIRONMENT=release \
        npm run build --prefix frontend
    python -m pip download --only-binary=:all: -r backend/requirements.txt -d backend/wheelhouse
    find backend/wheelhouse -maxdepth 1 -name '*.whl' -printf '%f\n' | LC_ALL=C sort > backend/wheels.txt

    python - "$sha" "$studio" "$stamp" "$contract" <<'PY'
import json
import platform
import subprocess
import sys
from pathlib import Path

sha, studio, stamp, contract = sys.argv[1:]
manifest = {
    "schema": 1,
    "sourceSha": sha,
    "sourceTimestamp": stamp,
    "version": json.loads(Path("package.json").read_text())["version"],
    "studioEnabled": studio == "true",
    "studioDefault": studio == "true",
    "pythiaContractsSha": contract,
    "node": subprocess.check_output(["node", "--version"], text=True).strip(),
    "python": platform.python_version(),
    "platform": platform.system(),
    "architecture": platform.machine(),
    "libc": platform.libc_ver(),
}
Path("release-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
identity = {key: manifest[key] for key in ("sourceSha", "version", "studioEnabled", "studioDefault")}
Path("frontend/dist/release-version.json").write_text(json.dumps(identity) + "\n")
PY
    tar --sort=name --mtime="@$epoch" --owner=0 --group=0 --numeric-owner \
        -cf - release-manifest.json frontend/dist backend package.json package-lock.json \
        vendor/onboarding scripts/render-authored-scenes.cjs LICENSE THIRD_PARTY_NOTICES.md \
        Multimedia_Instructional_Storyboard_Template.docx Visual_Slide_Storyboard_Template.pptx \
        | gzip -n > "$scratch/release.tar.gz"
)

mkdir -p release-artifacts
name="chimera-$sha-studio-$studio.tar.gz"
# Publish the archive and checksum together, refusing to replace an earlier build.
publish=$(mktemp -d release-artifacts/.build.XXXXXX)
trap 'rm -rf -- "$scratch" "$publish"' EXIT
mv "$scratch/release.tar.gz" "$publish/$name"
(cd "$publish" && sha256sum "$name" > SHA256SUMS)
mv -T --no-clobber "$publish" "release-artifacts/${name%.tar.gz}"
if [[ -d "$publish" ]]; then
    echo "An artifact already exists for this SHA and Studio setting." >&2
    exit 1
fi
