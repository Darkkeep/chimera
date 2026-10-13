"""Operator-only recovery and account controls; no outbound email is sent."""
import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app.password_auth import AccountStore
from backend.app.deployment import public_origin
from backend.app.storage import ROOT

parser = argparse.ArgumentParser(description="Manage a Chimera hosted account")
parser.add_argument("action", choices=["disable", "enable", "reset-password", "reset-link"])
parser.add_argument("--email", required=True)
args = parser.parse_args()
store = AccountStore(ROOT)
try:
    if args.action == "reset-link":
        print(public_origin()+"/#reset="+store.issue_reset(args.email))
    elif args.action == "reset-password":
        password = getpass.getpass("New password (15+ characters): ")
        if password != getpass.getpass("Confirm password: "):
            parser.error("Passwords do not match")
        store.change_account(args.email, password=password)
        print("Password changed; previous sessions and reset links revoked.")
    else:
        store.change_account(args.email, disabled=args.action == "disable")
        print(f"Account {args.action}d; previous sessions and reset links revoked.")
except ValueError as error:
    parser.error(str(error))
