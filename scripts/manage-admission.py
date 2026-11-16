"""Approve or revoke an email for the DARKROGUE-backed Chimera Showcase.

Run on the hosted service with its existing CHIMERA_WORKSPACE environment.
This does not create an account, alter DARKROGUE roles or grant project membership.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.admission import AdmissionStore
from app.storage import ROOT

parser = argparse.ArgumentParser(description="Manage founder-approved Chimera admission")
parser.add_argument("action", choices=["approve", "revoke", "list"])
parser.add_argument("--email", help="DARKROGUE account email for approve/revoke")
args = parser.parse_args()
store = AdmissionStore(ROOT)
if args.action == "list":
    for email in store.list_approved():
        print(email)
else:
    if not args.email:
        parser.error("--email is required for approve/revoke")
    store.set_approved(args.email, args.action == "approve")
    print(f"{args.action.title()}d admission for {args.email.strip().casefold()}")
