"""Create a hosted account interactively; passwords never enter command arguments."""
import argparse
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.app.password_auth import AccountStore
from backend.app.storage import ROOT

parser = argparse.ArgumentParser(description="Provision a Chimera hosted account")
parser.add_argument("--email", required=True)
parser.add_argument("--name", required=True)
parser.add_argument("--roles", nargs="+", default=["administrator"])
args = parser.parse_args()
password = getpass.getpass("Password (15+ characters): ")
if password != getpass.getpass("Confirm password: "):
    parser.error("Passwords do not match")
try:
    user_id = AccountStore(ROOT).provision(args.email, password, args.name, args.roles)
except ValueError as error:
    parser.error(str(error))
print(f"Provisioned {user_id} in {ROOT}")
