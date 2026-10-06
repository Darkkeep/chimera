import hashlib
from pathlib import Path

root = Path(__file__).resolve().parents[1] / '2026-10-06'
entries = (root / 'SHA256SUMS').read_text(encoding='utf-8').splitlines()
for entry in entries:
    expected, name = entry.split('  ', 1)
    path = (root / name).resolve()
    if not path.is_relative_to(root.resolve()):
        raise SystemExit(f'Invalid evidence path: {name}')
    if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
        raise SystemExit(f'Checksum mismatch: {name}')
print(f'Verified {len(entries)} retained qualification artifacts.')
