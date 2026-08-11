# Offline VM Test Handoff — HCopilot install/update rewrite

Paste this to whoever (or whichever Claude session) runs the Offline
Validation VM test.

---

## What changed and why

HCopilot's `install_offline.sh`/`update_offline.sh` were rewritten so the
app installs to one persistent, stable directory
(`/opt/rah/apps/hcopilot/`) instead of running out of the versioned release
folder it was installed from. Full rationale and diff summary:
`release-src/documentation/RELEASE_NOTES.md`, section "Deployment
mechanism rewrite" under the 1.0.1 heading.

## Where the release lives

```
release/1.0.0/   ← the ORIGINAL, pre-rewrite release. Still uses the OLD
                   mechanism (runs everything out of the release folder
                   itself, no /opt/rah/apps/, no DBeaver). Untouched,
                   immutable, archived. DO NOT install this during this
                   test and DO NOT try to "update" from it to 1.0.1 — it
                   predates the rewrite entirely, so 1.0.1's
                   update_offline.sh won't find an existing install and
                   will correctly refuse to proceed. It is not a valid
                   starting point for the update test below.

release/1.0.1/   ← the release to test. Application images unchanged from
                   before; only compose/scripts/database/documentation
                   were regenerated from release-src/.
```

`release/` is gitignored (build output, ~1.1GB each due to the Docker
image tars) — transfer `release/1.0.1/` to the Offline Validation VM
directly (SCP/DVD/USB), it is not something `git pull` will bring over.

`release-src/` (git-tracked) is the actual editable source everything in
`release/1.0.1/` was generated from — mention it only if something needs
fixing after the test, don't transfer it to the VM.

## Step 0 — Environment setup

`GoldenSnapshot-WithNetwork` has no Docker on it by design (RAH-OIP Lab
Environment Reference §2). Do not install Docker ad hoc / from the
internet.

1. Restore the Offline Validation VM to `GoldenSnapshot-WithNetwork`.
2. Install Docker via the already-built, already-validated
   `RAH-OIP-1.0.0_Debian13_2026-07-09` infrastructure release (on OR-STT
   under `~/rah-oip-releases/`) — this is the approved offline path to get
   Docker/Compose onto the VM.
3. Confirm `docker version` and `docker compose version` work before
   moving on.
4. Transfer `release/1.0.1/` onto the VM (SCP/SSH from the engineering
   machine — see RAH-OIP Lab Environment Reference §1.3 for connection
   details).

## Test 1 — Clean install

Make **two copies** of `release/1.0.1/` on the VM up front —
`release/1.0.1-a/` and `release/1.0.1-b/` — you'll need the second one for
Test 2, and copying it now (before either has been used) keeps them
identical.

Confirm no leftover state from a previous attempt: no existing
`/opt/rah/apps/hcopilot/`, no `hcopilot_sqlserver_data` volume, no prior
`hcopilot` containers.

```bash
cd release/1.0.1-a
./scripts/install_offline.sh
```

Check:
- [ ] Completes with no manual intervention (no editing `.env`, no
      hunting for a password) and ends with "Installation complete."
- [ ] `/opt/rah/apps/hcopilot/` exists and contains `compose/docker-compose.yml`,
      `compose/.env`, `database/`, `scripts/`, `backups/`, `INSTALLED_VERSION`
      (should read `1.0.1`), `DEPLOYMENT_HISTORY.log`.
- [ ] `compose/.env` has a real generated `MSSQL_SA_PASSWORD`/
      `DATABASE_PASSWORD` (24 random alphanumeric chars, NOT
      `__GENERATE_ME__` and NOT the old `NewPassword2004`), file mode `600`.
- [ ] `docker compose ls` (or `docker ps`) shows the project name `hcopilot`
      — not derived from `release`/`1.0.1-a`/`compose`.
- [ ] All 4 containers up, `db-init` exited 0, app reachable at
      `http://<vm-ip>:8082/`, login `admin`/`admin` works.
- [ ] **Add representative test data now** (e.g. one test patient + bed
      assignment) and note exactly what you added — Test 2 checks this
      survives the update.
- [ ] **Release-folder independence** — the standard's most important
      check: move or delete `release/1.0.1-a/` entirely, then:
      - `/opt/rah/apps/hcopilot/scripts/verify_installation.sh` still passes
      - `docker compose restart` (from `/opt/rah/apps/hcopilot/compose/`)
        still works
      - the app is still reachable, including the test data you just added
      This proves the install doesn't secretly depend on the release
      folder still being there. (Do this AFTER you've added the test data
      above, and before Test 2 — you won't need `1.0.1-a/` again.)
- [ ] **DBeaver** — this is new and unverified, be skeptical of it. Open
      DBeaver on the VM. Did a "HCopilot (hcopilot)" SQL Server connection
      appear? Does it actually connect (enter the password from `.env`
      when prompted)? If it didn't appear at all, or appears but DBeaver
      shows a driver/config error, that's expected-possible — report
      exactly what happened (nothing found vs. wrong path vs. wrong
      driver id vs. connects fine) so `provision_dbeaver.sh` /
      `_dbeaver_register.py` (`release-src/scripts/`) can be corrected —
      the driver id used (`sqlserver`) was a best guess, not verified
      against a real DBeaver install yet.

## Test 2 — Update

Use the **`release/1.0.1-b/`** copy you made in Step 0 — a folder that was
never touched by Test 1. This is what actually proves update doesn't
depend on the original install folder still being there.

Same version number going in (1.0.1) and coming out (1.0.1) looks odd, but
that's intentional for this pass — it isn't testing a version bump, it's
testing the persistence mechanism itself (separate-folder independence,
`.env`/credential preservation, DBeaver reconciliation, history append,
deterministic container reconciliation). A real N→N+1 test needs an actual
`1.0.2` built via `release-src/build_release.sh`, which is a separate,
later task — don't attempt it by mixing in `release/1.0.0`, for the reason
explained above.

```bash
cd release/1.0.1-b
./scripts/update_offline.sh
```

Check:
- [ ] Finds the existing `/opt/rah/apps/hcopilot/` install automatically —
      no prompts asking where it's installed.
- [ ] Backs up the database automatically (no manual confirmation step —
      check `/opt/rah/apps/hcopilot/backups/` for a new `.bak` file).
- [ ] `.env` values from Test 1 (the generated password) are **unchanged**
      after the update — diff `compose/.env` before/after if easy.
- [ ] `DEPLOYMENT_HISTORY.log` now has 2 lines (install + update).
- [ ] The test data you added during Test 1 is still there after the
      update.
- [ ] App still reachable and functional afterward.

## Reporting back

For each checkbox above: pass/fail + one line of evidence (command output,
error message, screenshot description). Don't say "seems fine" — say what
you actually saw. If DBeaver auto-registration fails, that's a known,
expected-possible outcome, not a blocker for the rest — just report it
precisely so it can be fixed.
