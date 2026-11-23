#!/usr/bin/env bash
# Run from the extracted release. Supply a new absolute venv path outside the release.
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd -P)
target=${1:?Usage: offline-install.sh /absolute/path/to/new-venv}
[[ $target == /* && ! -e $target && ! -L $target ]] || { echo 'Use a new absolute venv path.' >&2; exit 2; }
unset PYTHONHOME PYTHONPATH
export PYTHONDONTWRITEBYTECODE=1 PIP_CONFIG_FILE=/dev/null
"$root/runtime/python/bin/python3" -I -m venv --copies "$target"
"$target/bin/python" -Im pip --isolated install --disable-pip-version-check --no-index --only-binary=:all: \
    --find-links "$root/backend/wheelhouse" --require-hashes -r "$root/backend/requirements-linux-x86_64-cp314.lock"
"$target/bin/python" -Im pip check
