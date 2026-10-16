"""Build an evaluation ZIP from committed source, never local installation data."""
import hashlib
import io
import json
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])


def archive_payload(revision):
    with zipfile.ZipFile(io.BytesIO(git('archive', '--format=zip', revision))) as source:
        payload = {n: source.read(n) for n in source.namelist() if not n.endswith('/')}
    submodules = {}
    for entry in git('ls-tree', '-rz', revision).split(b'\0'):
        if not entry:
            continue
        metadata, path = entry.split(b'\t', 1)
        mode, _, commit = metadata.decode().split()
        if mode != '160000':
            continue
        name = path.decode('utf-8')
        pinned = commit
        # Export the recorded commit, never the submodule's working files or HEAD.
        data = subprocess.check_output([
            'git', '-C', str(ROOT / name), 'archive', '--format=zip', pinned,
        ])
        with zipfile.ZipFile(io.BytesIO(data)) as source:
            payload.update({f'{name}/{n}': source.read(n) for n in source.namelist() if not n.endswith('/')})
        submodules[name] = pinned
    return payload, submodules


def main():
    revision = git('rev-parse', 'HEAD').decode().strip()
    payload, submodules = archive_payload(revision)
    version = json.loads(payload['package.json'])['version']
    helpers = {}
    for name in ('Install-Chimera.ps1', 'Start-Chimera.ps1', 'START-HERE.md'):
        payload[name] = (ROOT / 'distribution' / name).read_bytes()
        helpers[name] = hashlib.sha256(payload[name]).hexdigest()
    # Helper edits produce a different artifact even for the same application SHA.
    helper_revision = hashlib.sha256(json.dumps(helpers, sort_keys=True).encode()).hexdigest()[:12]
    prefix = f'chimera-{version}-evaluation-{revision[:12]}-{helper_revision}'
    manifest = {
        'product': 'Chimera', 'version': version, 'status': 'evaluation-human-acceptance-pending',
        'sourceRevision': revision, 'source': 'git archive of recorded revision',
        'packagingHelpers': helpers,
        'submodules': submodules,
        'files': {n: hashlib.sha256(data).hexdigest() for n, data in sorted(payload.items())},
    }
    payload['PACKAGE-MANIFEST.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    output = ROOT / 'workspace' / 'distribution'
    output.mkdir(parents=True, exist_ok=True)
    target = output / (prefix + '.zip')
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as package:
        for name, data in sorted(payload.items()):
            # Stable ZIP metadata makes repeat builds byte-for-byte reproducible.
            info = zipfile.ZipInfo(f'{prefix}/{name}')
            info.compress_type = zipfile.ZIP_DEFLATED
            package.writestr(info, data)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix('.zip.sha256').write_text(f'{digest}  {target.name}\n', encoding='ascii')
    print(target)
    print(f'SHA256 {digest}')


if __name__ == '__main__':
    main()
