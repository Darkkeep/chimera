#!/usr/bin/env python3
"""Read-only, non-interactive Chimera host preflight over an EXISTING SSH identity.

No hPanel session, password prompt, privilege escalation, or server mutation.
Use an existing trusted SSH config alias (example: chimera-prod). All evidence
is printed to the local terminal only; do not post unredacted output publicly.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys

SSH_NAME = re.compile(r"^[A-Za-z0-9_.@-]{1,128}$")
UNIT_NAME = re.compile(r"^[A-Za-z0-9_.@-]{1,128}\.service$")
REMOTE_SCRIPT = r'''
set -eu
unit=$1
printf '=== CHIMERA READ-ONLY PREFLIGHT ===\n'
printf 'hostname: '; hostname -s
printf 'os: '; uname -s
printf 'architecture: '; uname -m
printf 'service_active: '; systemctl is-active "$unit" 2>/dev/null || :
printf 'service_enabled: '; systemctl is-enabled "$unit" 2>/dev/null || :
printf 'service_load: '; systemctl show "$unit" -p LoadState --value 2>/dev/null || :
printf 'systemctl_available: '
command -v systemctl >/dev/null 2>&1 && printf 'yes\n' || printf 'no\n'
printf 'backup_directory: '
if [ -d /var/backups/chimera ]; then
  printf 'exists\n'
  printf 'backup_owner_mode: '
  stat -c '%U:%G %a' /var/backups/chimera 2>/dev/null || printf 'unavailable\n'
  printf 'backup_readable_by_current_user: '
  if [ -r /var/backups/chimera ] && [ -x /var/backups/chimera ]; then
    printf 'yes\n'
  else
    printf 'no\n'
  fi
else
  printf 'missing_or_inaccessible\n'
fi
printf 'disk_free_kb_root: '; df -Pk / | awk 'NR==2 {print $4}'
printf 'inspection_complete: yes\n'
'''

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ssh_alias", help="Preconfigured, trusted alias in ~/.ssh/config")
    parser.add_argument("--service", default="chimera-networked.service",
                        help="Expected existing systemd unit; default: chimera-networked.service")
    parser.add_argument("--json", action="store_true", help="Render parsed evidence as JSON")
    args = parser.parse_args()
    if not SSH_NAME.fullmatch(args.ssh_alias) or args.ssh_alias.startswith("-"):
        parser.error("SSH alias must be a simple trusted host alias")
    if not UNIT_NAME.fullmatch(args.service) or args.service.startswith("-"):
        parser.error("service must be a systemd .service unit name")

    command = [
        "ssh", "-T", "-o", "BatchMode=yes", "-o", "NumberOfPasswordPrompts=0",
        "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=8",
        "--", args.ssh_alias, "sh", "-s", "--", args.service,
    ]
    try:
        result = subprocess.run(command, input=REMOTE_SCRIPT, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                timeout=25, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        print(f"SSH preflight could not start: {type(exc).__name__}", file=sys.stderr)
        return 2
    if result.returncode:
        # SSH output may contain hostnames, usernames, or connection details.
        # Never echo raw ssh stderr into shared logs.
        print("SSH preflight unavailable. Verify alias, accepted host key, and key-based access.",
              file=sys.stderr)
        return 2
    if "inspection_complete: yes" not in result.stdout:
        print("SSH preflight returned incomplete evidence.", file=sys.stderr)
        return 2
    if args.json:
        data = {}
        for line in result.stdout.splitlines():
            if ": " in line:
                key, value = line.split(": ", 1)
                data[key] = value
        print(json.dumps(data, indent=2, sort_keys=True))
    else:
        print(result.stdout.rstrip())
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
