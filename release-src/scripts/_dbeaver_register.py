#!/usr/bin/env python3
"""_dbeaver_register.py — adds one connection entry to DBeaver CE's
data-sources.json if an entry with the same name doesn't already exist.
Never modifies or removes any existing entry. Called by provision_dbeaver.sh.

NOTE: the exact provider/driver id ("sqlserver") below is DBeaver CE's usual
bundled Microsoft SQL Server driver id as of the 26.x line referenced in the
RAH-OIP Lab Environment Reference. This has not been confirmed against a
live DBeaver install yet — if the connection appears in DBeaver but shows a
driver error, correct PROVIDER_ID/DRIVER_ID below to match what a manually
created SQL Server connection actually uses on the real box, per RAH
Application Release & Deployment Standard §5.8 ("inspect the actual
installed DBeaver version/configuration mechanism").
"""
import argparse
import json
import os
import sys
import uuid

PROVIDER_ID = "sqlserver"
DRIVER_ID = "sqlserver"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data-sources-file", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--host", required=True)
    p.add_argument("--port", required=True)
    p.add_argument("--database", required=True)
    p.add_argument("--user", required=True)
    args = p.parse_args()

    path = args.data_sources_file
    os.makedirs(os.path.dirname(path), exist_ok=True)

    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError as e:
                print(f"ERROR: {path} is not valid JSON, refusing to touch it: {e}", file=sys.stderr)
                sys.exit(1)
    else:
        data = {}

    connections = data.setdefault("connections", {})

    for conn in connections.values():
        if isinstance(conn, dict) and conn.get("name") == args.name:
            print(f"Connection '{args.name}' already present — leaving it untouched.")
            return

    # Timestamped backup before the first write to this file, so a mistaken
    # entry can be undone by hand.
    if os.path.exists(path):
        backup_path = path + ".bak"
        if not os.path.exists(backup_path):
            with open(path, "r", encoding="utf-8") as src, open(backup_path, "w", encoding="utf-8") as dst:
                dst.write(src.read())

    conn_id = f"hcopilot-{uuid.uuid4()}"
    connections[conn_id] = {
        "provider": PROVIDER_ID,
        "driver": DRIVER_ID,
        "name": args.name,
        "save-password": False,
        "configuration": {
            "host": args.host,
            "port": str(args.port),
            "database": args.database,
            "user": args.user,
            "configuration-type": "manual",
            "auth-model": "native",
            "type": "dev",
            "provider-properties": {
                "trustServerCertificate": "true"
            }
        }
    }

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent="\t")

    print(f"Added connection '{args.name}' to {path}.")


if __name__ == "__main__":
    main()
