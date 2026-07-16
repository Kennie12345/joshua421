# Grace is a persona constraint, not a schema constraint

joshua421 promises "grace, not guilt" (design.md, Promise 4). There were two ways to keep it: deny the companion the facts so it *cannot* guilt anyone, or give it the facts and require it not to. We chose the second — **the companion knows everything and says almost none of it.**

## Why

Particularity requires facts. `core/persona.ts` names generic spirituality as *the* failure mode and requires every note to be anchored to a concrete particular of the day or an intention the person actually named. A companion denied the record cannot be particular — so enforcing grace by withholding facts would hard-wire the exact failure the persona forbids. Wisdom is knowing much and weaponising none of it; it is not knowing nothing.

The evidence removes the apparent cost. Feedback's active ingredient is information the *person* uses to steer, not a score a system assigns (Locke & Latham 2002, *American Psychologist* 57(9), p.708) — and it is a moderator, not a necessary condition. Crucially, Harkin et al. (2016, *Psychological Bulletin* 142(2), p.214; 138 studies, N=19,951) found *"the nature of the reference value did not influence effect sizes"* — comparing against a **past state** works as well as comparing against a **desired target**. The memorial *is* a reference value. Grace and efficacy do not trade off.

This also matches the rest of the architecture: joshua421 makes no model calls of its own, so every promise it makes is already prompt-enforced.

**The strongest argument is the one about who is accusing whom.** Framing the promise as "do not *cause* guilt" gets the situation backwards: the guilt is already there. A person has been to church forty times, prayed most days, sat with Scripture more than they remember — and still says "I've done nothing." That dismissal precedes joshua421 and does not need its help. The record is therefore not a hazard to be managed around; it is the **evidence that refutes an accusation already being made**, and you cannot answer "I've done nothing" without one. A companion denied the facts cannot defend the person against their own dismissal — which is not a neutral failure but a desertion, since the accusation goes on either way. See **Dismissal** in `glossary.md`.

## Considered options

- **Enforce by absence** — no field for a tally, so no tally can exist. Rejected: it protects grace by making the companion vague, which is the failure mode the persona already forbids. It buys a structural guarantee with the product's whole value.
- **Full scoreboard** — counts, rates, streaks. Rejected: the memorial gets the same effect (Harkin), and guilt's mechanism carries a documented cost — introjected regulation raises effort *and* anxiety, and makes people cope worse with failure (Ryan & Deci 2000, pp.72-73), which is fatal for a formation tool.

## Consequences

Grace stops being structural. Today the companion physically cannot guilt anyone about a gap, because `mcp.ts` never reads the Log — but that is an accident of wiring, not a design, and it is the only thing protecting the promise right now. Once the companion can read the record, only the persona stands between the facts and a scorecard.

That must therefore be held by **test**, not by intention: the companion never surfaces a count, a rate, or a streak, and `FIXED_CENTRE` must carry the know-everything-say-little line.

Note that the contradiction predates this decision: `core/reflection.ts` already carries `status: 'shown-up' | 'skipped'` — a compliance field — while design.md declares joshua421 "not a habit-tracker with a cross on it". This ADR makes the resolution explicit rather than leaving the two to disagree silently. (`'skipped'` is currently written by nothing.)
