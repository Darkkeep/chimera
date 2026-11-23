# One-time Chimera SSH access: no recurring hPanel login

This is part of Issue #42 / PR #44, not another deployment pipeline.

## Goal and boundary

One authorized SSH identity must be able to run a read-only host check from a **fresh** terminal without hPanel, browser cookies, prompts, or production changes. The identity should have no blanket root access. This does not authorize staging, deployment, backups changes, service restart or cutover.

## First reuse what already exists

On the owner's laptop, check whether an approved SSH host alias and key already exist. **Do not share private keys, SSH configuration, token values or terminal transcripts containing secrets in GitHub or chat.** A known host and public key fingerprint can be compared privately with a trusted Hostinger source.

If the connection is already configured:

```powershell
ssh -o BatchMode=yes -o NumberOfPasswordPrompts=0 -o StrictHostKeyChecking=yes chimera-prod exit
python scripts/chimera-ssh-preflight.py chimera-prod --json
```

Run these commands from the repository checkout with Python 3.12+ and OpenSSH available. The alias `chimera-prod` is **illustrative**; use the actual configured SSH alias. The default existing service name is `chimera-networked.service`; specify `--service NAME.service` only if the real unit differs.

The script performs fixed read-only remote operations. It cannot discover or prove all server configuration, access controls, backup contents, archive permissions, project recovery or rollback. Its output is private operator evidence to be sanitized before filing.

## If no key-based SSH connection exists

This is **one** Owner-authorized provisioning task, not repeated hPanel logins:

1. Confirm the hosting product actually provides SSH and identify the correct server/account using existing trusted Hostinger account information. Do not infer from the repository's sample Nginx/systemd configuration.
2. Generate or reuse a **dedicated** SSH keypair for an authorized, minimally privileged operator. Keep the private key in the approved device secret store, not GitHub files, chat or artifacts.
3. Verify the server's SSH host-key fingerprint through a trusted channel **before** accepting it into the client's known-hosts file. Do not use `StrictHostKeyChecking=no` or auto-accept a new fingerprint.
4. Install only the **public** key via the host's supported authorized-key mechanism, with Owner approval. An existing administrative account may be needed once. Avoid a root login for routine operations.
5. Configure a local SSH alias and validate noninteractive `BatchMode=yes` login. Test from a **fresh** process after closing the Hostinger browser.
6. Record **only** success/failure, tested account role, server identity reference and non-sensitive host observations in Issue #42. Do not copy terminal secrets.

## Acceptance / stop rule

- **PASS**: fresh-session SSH succeeds without prompts and the read-only preflight returns service status and backup-directory metadata; approved role has no unintended production-write privileges. Continue with backup/restore and staging qualification, each under its own approval.
- **BLOCKED**: SSH unsupported, key not provisioned, wrong host, incorrect allowed user, unverified host key, or denied access. Report the precise blocker. Do not escalate credentials, weaken host checking, or ask for repeated hPanel sign-ins.
- **STOP**: the agreed four engineering-hour timebox is reached. Preserve artifacts and choose a single alternative only after reviewing evidence.

Production SSH access remains a separate concern from GitHub release-artifact CI. The latter already builds a candidate without contacting Hostinger.
