# The centre is one module with projections

The fixed centre lives in `core/centre.ts` as **clauses** — one id, one breath-length
sentence, one anchor phrase each. Nothing else in the codebase writes the centre out. Every
surface that must restate it asks for a projection instead: `centreBreath()` for the whole
thing, `centreFor(act)` for the clauses that bear on one act, and `describeTool(act, purpose)`
for a tool description. The persona's authored long-form stays hand-written, and a test proves
each clause still survives in it.

## Why

The centre has to be restated where the model acts. A persona injected once at connect gets
under-weighted as a long reflection grows (ADR 0001), and a skill folder copied out of this
repo arrives with no server to inherit a persona from (ADR 0007). So the centre necessarily
ships on three carriers: the persona's long-form, every tool description, and every `SKILL.md`.

Restating it is right. Re-typing it is not. Before this module the compressed centre was a
string constant pasted whole into six tool descriptions, and its long form was authored
separately in the persona — so the centre was **one meaning smeared across three axes**:
identity, capability, and practice. Change it and you had to remember five other places; and
every tool description recited the whole of it whether or not it bore on what that tool does.
`undo_write` was carrying the rules of speaking; `get_grounding` was carrying nothing at all.

The evidence that this was overdue arrived while it was being written: the centre grew from 652
to 875 characters in one session, and every skill file had to be re-stamped behind it.

Clauses make the axes orthogonal. The centre is one module; each surface asks for the
projection it needs; adding a clause is a one-line edit that every carrier picks up.

## The rule for projections

**A surface carries the clauses that bear on the act it performs** — and never restates what
another surface is guaranteeing at the same moment. Two consequences of that rule are load-
bearing and must not be traded for tokens:

- **`read_day` carries the whole breath.** The persona's loop makes it the first call of every
  reflection, so the full centre re-enters at the start of every conversation — including in a
  client that never fetched the server's `instructions`, which the spec permits and which
  status.md flags as the case where the tool descriptions stop being belt-and-braces and
  become the guarantee. Every other projection is a subset; this one is the safety net.
- **`load_skill` carries none.** What it returns is a `SKILL.md`, which carries the whole
  breath already. This is the seam working: a surface does not restate what it is about to hand
  over.

The saving is real but secondary — 5,250 characters of duplicated centre across six tool
descriptions became 2,357 across eight.

## What was given up

**The long-form is still authored twice over.** The persona's "## The fixed centre" section is
product voice — it flexes, it teaches by contrast, and its clauses do not map one-to-one onto
the breath (consent lives in "The loop", brevity in "How you speak"). Generating it from clause
data would have made it read like configuration. So it stays hand-written, and `anchor` carries
the cost: each clause names a phrase that must appear in `COMPANION_INSTRUCTIONS`, asserted by
test. Authored duplication with an assertion — the same bargain ADR 0007 struck for the skills.

A clause with no long-form counterpart is pinned in `BREATH_ONLY`. That list is a gap, not a
category: it exists so that a centre which grows only in the compression cannot slip past
unnoticed.

## Rejected

- **One blob, three copies (the status quo).** Cheapest to read, and it had already drifted
  twice in a day.
- **Generate the persona from the clauses.** Cheaper to keep in sync, at the price of the one
  text in this project that must sound like a person rather than a schema.
- **Trim `reflect` to a subset for tokens.** The clauses that bear on no single tool act —
  grace, brevity, toward-God-not-the-screen — would then live only in `instructions`, the one
  surface the protocol allows a client to skip.
- **Project per tool rather than per act.** The taxonomy would then track the tool list, so
  adding a surface would mean inventing a new category rather than naming what it does. Acts
  are the smaller vocabulary, and two tools that write are governed by the same clauses.

## Consequences

- Editing the centre is a one-place edit in `core/centre.ts`. Everything else follows on the
  next build; `npm run skills:build` re-stamps the folders, and `--check` fails loudly if it
  has not been run.
- `FIXED_CENTRE` survives as `centreBreath()` — the whole-centre form, still exported from
  `core/persona.ts`, still what a `SKILL.md` is stamped with.
- A new tool must name its act. If none of the existing acts fit, that is a signal to look at
  what the tool really does before adding a category.
- `centre.test.ts` holds the invariants: no clause stranded, every writing act carries consent,
  `reflect` carries everything, `load` carries nothing.
