#!/usr/bin/env bash
# Build an immutable release payload from tracked source. Never contacts a host.
set -euo pipefail
umask 022
export LC_ALL=C TZ=UTC PYTHONDONTWRITEBYTECODE=1
unset PYTHONHOME PYTHONPATH

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
git archive "$sha" -- frontend scripts/release/runtime-inputs.txt scripts/release/offline-install.sh backend/requirements-linux-x86_64-cp314.lock docs/user-guide.pdf backend/app backend/bridges backend/requirements.txt \
    package.json package-lock.json vendor/onboarding scripts/render-authored-scenes.cjs \
    LICENSE THIRD_PARTY_NOTICES.md Multimedia_Instructional_Storyboard_Template.docx \
    Visual_Slide_Storyboard_Template.pptx | tar -x -C "$scratch/src"

(
    cd "$scratch/src"
    mkdir -p runtime/browser "$scratch/download" "$scratch/node"
    while read -r digest name url; do
        input="$scratch/download/$name"
        if [[ -n ${CHIMERA_RELEASE_INPUTS:-} && -f $CHIMERA_RELEASE_INPUTS/$name ]]; then
            cp -- "$CHIMERA_RELEASE_INPUTS/$name" "$input"
        else
            curl --fail --location --retry 3 --proto '=https' --proto-redir '=https' "$url" -o "$input"
        fi
        echo "$digest  $input" | sha256sum --check
    done < scripts/release/runtime-inputs.txt
    tar -xzf "$scratch/download/python.tgz" --no-same-owner -C runtime
    tar -xJf "$scratch/download/node-v24.19.0-linux-x64.tar.xz" --strip-components=1 -C "$scratch/node"
    export PATH="$scratch/node/bin:$PWD/runtime/python/bin:$PATH"
    [[ $(python3 -c 'import platform; print(platform.python_version())') == 3.14.4 ]]
    [[ $(node --version) == v24.19.0 ]]
    unset NODE_ENV
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund
    browser_revision=$(node -p "require(require('path').join(require('path').dirname(require.resolve('playwright-core/package.json', {paths: [require.resolve('playwright')]})), 'browsers.json')).browsers.find(b=>b.name==='chromium-headless-shell').revision")
    unzip -q "$scratch/download/chromium-1217.zip" -d "runtime/browser/chromium_headless_shell-$browser_revision"
    mkdir -p runtime/node/bin
    cp "$scratch/node/bin/node" runtime/node/bin/
    cp "$scratch/node/LICENSE" runtime/node/

    npm ci --prefix frontend
    VITE_CHIMERA_STUDIO_ENABLED="$studio" VITE_CHIMERA_STUDIO_DEFAULT="$studio" VITE_CHIMERA_BUILD_SHA="$sha" \
        VITE_CHIMERA_BUILD_TIMESTAMP="$stamp" VITE_CHIMERA_BUILD_ENVIRONMENT=release \
        npm run build --prefix frontend
    python3 -Im pip --isolated download --disable-pip-version-check --require-hashes --only-binary=:all: \
        -r backend/requirements-linux-x86_64-cp314.lock -d backend/wheelhouse
    # Resolve the declared direct requirements strictly against the locked offline files as well.
    python3 -Im pip --isolated install --dry-run --ignore-installed --no-index --find-links backend/wheelhouse -r backend/requirements.txt
    find backend/wheelhouse -maxdepth 1 -name '*.whl' -printf '%f\n' | LC_ALL=C sort > backend/wheels.txt

    python3 - "$sha" "$studio" "$stamp" "$contract" <<'PY'
import json
import platform
import subprocess
import sys
from pathlib import Path

sha, studio, stamp, contract = sys.argv[1:]
manifest = {
    "schema": 2,
    "pythonExecutable": "runtime/python/bin/python3",
    "nodeBin": "runtime/node/bin",
    "playwrightBrowsersPath": "runtime/browser",
    "wheelLock": "backend/requirements-linux-x86_64-cp314.lock",
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
    # Bytecode embeds the temporary build path and is regenerated at runtime.
    find runtime/python -type f -name "*.pyc" -delete
    tar --mode=u+rw,go+r,go-w --sort=name --mtime="@$epoch" --owner=0 --group=0 --numeric-owner \
        -cf - release-manifest.json frontend/dist backend runtime node_modules scripts/release package.json package-lock.json \
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
