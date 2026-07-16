# The Journal is upsert-only

The Journal's write surface is one method: `upsert(kind, periodKey, entry)`. There is no `add` and no `update`. Identity is **kind + periodKey** — a day for summaries and markers, an ISO week/month/season key for rollups, a constant for the preferences entry. Writing to an identity that exists replaces it; writing to one that doesn't creates it.

## Why

Every use the design names is one-entry-per-period: one Marker per reflected day, one summary per day, one Rollup per week, one Grounding. Meanwhile the writer is a scheduled worker that launchd can fire twice and a re-runnable setup. Under `add`, every one of those callers owns its own dedup or silently duplicates; under `upsert`, retrying is safe by contract and dedup logic exists nowhere. The interface got smaller and the adapter got deeper — the idempotency lives once, behind the seam, instead of N times in front of it.

`update(id, patch)` fell out for the same reason: every caller that wanted it actually meant "replace the entry for this period," and had to query for the id first. `upsert` is that query-then-write, made atomic-enough and given the safety guard once.

## What was given up

**Append semantics.** Two reflections on the same day collapse into one Marker; the Journal cannot represent "sessions," only periods. That is aligned, not incidental — Silence is counted in days, the Memorial is read in days, and the cadence engine already cannot (and should not) distinguish a morning reflection from an evening one. If a future feature genuinely needs sub-day granularity, that is a new decision, not a bug in this one.

## Rejected

- **Keep CRUD and bolt `upsert` alongside** — five methods where three suffice, and every caller must know which write is safe to retry. The width invites the duplication bug back in through `add`.
- **Use-shaped writes on the port** (`writeSummary`, `recordMarker`, …) — the uses live in core *on top of* the Journal; baking them into the port means the port changes every time a use is added, and the adapter re-implements the tagging per use.

## Consequences

- `delete(id)` survives, guarded (only ever a joshua421-tagged entry) — reversal needs it and nothing else does.
- The adapter must treat entries written before this decision (tagged with kind + date but no period) as the same identity, or a re-run duplicates exactly the entries the contract exists to protect.
- The one-per-period invariant is the adapter's to enforce: an upsert that finds duplicates for its identity heals them rather than adding a third.
