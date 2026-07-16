# The calendar is the subject, not the store

joshua421 keeps everything in the person's own calendar — summaries, the behavioural record, rollups, eventually the grounding. design.md argues this on technical grounds: no per-user database to host, total data ownership, a look-back is just a date-range query. Those are all true and all **secondary**. The real reason is that **the calendar is the thing being redeemed.**

## Why

The calendar is the instrument of the productive self — the ledger where a life is already accounted for, optimised, and owned by everything except God. That is precisely why God's work belongs *there* rather than in a devotional silo beside it: joshua421's ambition is to shape the person's day in reflection of Christ, in the place their day actually lives.

A reflection that ends in an app the person visits is a reflection that changed nothing. A reflection that ends in Tuesday's 2pm has changed Tuesday.

## Consequences

The technical awkwardness is **accepted, not regretted**. Calendars are poor at structured data and querying; we encode a little state in `extendedProperties` and live with rate limits. That is the cost of writing into the ledger that matters rather than one we control, and it is worth paying.

This is the ADR that exists to stop a reasonable future engineer from "fixing" it. Seeing `journal-google.ts`, they will ask why this isn't Postgres, and every technical answer to that question is losable — cost falls, hosting gets easy, the rate limits chafe. The answer that does not lose is that Postgres would be a **database**, and the calendar is a **subject**. Migrating the store to a real database would not be an optimisation; it would be the removal of the product's thesis, leaving a devotional app that happens to sync.

Where a genuine query problem appears, the answer is hierarchical rollups (design.md, "Consuming it over time") — bounded reads at every horizon — not a different store.
