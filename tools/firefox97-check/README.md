# Firefox 97 compatibility check

The hospital PCs run **Firefox 97** (Feb 2022). This kit runs genuine Firefox 97 in Docker (headless, driven by
Selenium/geckodriver) against a running HCopilot and reports what works. Nothing is installed on the host.

Build once:

    docker build -t zz-firefox97 tools/firefox97-check

Run (with the stack up on 8082/8083; on Windows/Git Bash prefix `MSYS_NO_PATHCONV=1`):

    mkdir -p tools/firefox97-check/out
    docker run --rm --add-host host.docker.internal:host-gateway \
      -v "$PWD/tools/firefox97-check:/work" -v "$PWD/tools/firefox97-check/out:/out" \
      zz-firefox97 python3 /work/run_dialogs.py

| script | what it checks |
|---|---|
| `probe.py` | which JS APIs / CSS features Firefox 97 has (e.g. `<dialog>` is missing, `:has()` too) |
| `run.py` | every page of the new UI renders (screenshots in `out/`) |
| `run_old.py` | every section of the old UI renders, a bed click and the date picker work |
| `run_dialogs.py` | every kind of popup in the new UI opens, steps, closes with Escape (19 checks) |

Findings that shaped the code (do not undo):
- Firefox 97 has **no `<dialog>` / `showModal()`** (arrives in 98) - use `components/feedback/Dialog.tsx`, never the native element.
- No `:has()`, `color-mix()`, CSS nesting, `dvh`, `text-wrap` - none are used; keep it that way.
- `vite.config.ts` pins `build.target` to firefox97 so newer *syntax* cannot slip in. Missing *APIs* are only caught by this kit.
