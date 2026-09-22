# =============================================================================
# hospital_directory/guess.py — "Find Possible Matches" Middle-Name Guess Loop
# =============================================================================
#
# When a user knows a patient's first and last name but not the middle/
# father name the vendor's structured search requires, this tries every
# candidate name in the admin-editable list (candidates_db.py) as if it
# were the real middle name, and combines every hit — modeled directly on
# the equivalent feature in the sibling app (HCAT), per
# HOSPITAL_DIRECTORY_API_INTEGRATION.md §7.3:
#
#   - Dispatches every candidate concurrently (a capped worker pool — the
#     vendor's real tolerance for concurrent requests has never been
#     load-tested).
#   - Never stops at the first match: a first+last name pair can
#     legitimately match more than one real person who differs only in the
#     middle/father name, so stopping early would silently hide the second
#     person rather than just cost one extra call.
#   - Dedupes hits by full_name alone, not id/birth_date — the frontend's
#     selection handler only ever commits the clicked row's name, so
#     multiple rows sharing an identical full name are, from the user's
#     point of view, one indistinguishable choice.
#
# Only ever triggered by one explicit user action (the "Find possible
# matches" button) — never fired per keystroke — so the concurrency cap and
# dedup logic are enforced here, once, regardless of what UI calls it.
# =============================================================================

import concurrent.futures

from . import client, candidates_db

MAX_WORKERS = 8


def find_possible_matches(first_name: str, last_name: str) -> dict:
    """
    Try every candidate middle/father name against the structured search.

    Returns {"status": "ok", "items": [...], "tried": N} normally. If every
    single candidate call failed with the *same* non-ok status (e.g. the
    integration isn't configured, or the key is rejected), that status is
    surfaced directly instead of being misreported as "no matches found".
    """
    candidates = candidates_db.list_candidates()
    if not candidates:
        return {"status": "ok", "items": [], "tried": 0}

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = [
            pool.submit(client.search_patients, first_name=first_name, father_name=candidate, last_name=last_name)
            for candidate in candidates
        ]
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())

    if any(r["status"] == "ok" for r in results):
        combined, seen_names = [], set()
        for r in results:
            if r["status"] != "ok":
                continue
            for item in r.get("items", []):
                name = item.get("full_name")
                if name and name not in seen_names:
                    seen_names.add(name)
                    combined.append(item)
        return {"status": "ok", "items": combined, "tried": len(candidates)}

    # Every candidate call failed the same way (e.g. disabled/unauthorized) —
    # surface that instead of an honest-looking "no matches found".
    statuses = {r["status"] for r in results}
    only_status = next(iter(statuses)) if len(statuses) == 1 else "http_error"
    message = next((r.get("message") for r in results if r.get("message")), None)
    return {"status": only_status, "message": message, "items": [], "tried": len(candidates)}
