# joshua421

> "When your children ask in time to come, 'What do these stones mean?'
> then you shall let your children know..." — **Joshua 4:21–22**

In Joshua 4, Israel crosses the Jordan on dry ground. Before they move on, God
has twelve men each carry a stone from the riverbed and pile them into a
memorial — so that later, when the question comes, the story of God's
faithfulness gets retold.

That is the whole point of this project.

## Purpose

**Help me look back and see how faithful God has been.**

Every decision — features, cost, architecture — is measured against that one
sentence. If a thing helps someone look back and see God's faithfulness, it
belongs. If it only drives engagement, it does not.

## What it does (v1)

Around my calendar — and, while I'm the only user, my own diary and email — it
offers a quiet **pre-reflection** before an event ("what posture do you want to
bring into this?"), and a **reflection** afterward that ties the day back to
God's faithfulness. It meets me where I already am: my inbox and my calendar.
No app. No dashboard. Purely functional.

## The stones

A **stone** is a record of *consistent effort over time*. The **cairn** is the
growing pile of those stones — the thing I read back later and say,
*"look how faithful God has been in my life."* The pile is my own real entries
accumulating; the system doesn't draw it, it helps shape and reflect on it.

## The promises

1. **Behaviour, not content.** I remember *that* you showed up — never *what*
   you said. Content is read live, used in the moment, and discarded. The store
   holds the cairn (dates, kinds, showed-up / skipped, streaks) and nothing else.
2. **Grace, not guilt.** A gap is noticed without reproach. The return after
   absence is met with grace — *"the Lord has been faithful through these days
   too — want to mark them?"* — never a broken-streak shaming. This is a
   memorial to God's faithfulness, not a scorecard of my discipline.
3. **Gentle and postural.** It prods toward God; it is never a harsh taskmaster.

## Scope

**Dogfood first.** v1 is for me — my own tokens, no account system, no third-
party data. Onboarding others (and the token custody, minimal scopes, and
hosting that responsibly requires) is a deliberate, later step — and a hard
tripwire, not a refactor-later.

## Architecture (one breath)

A TypeScript **core engine** (pure: read → reflect → persist behaviour →
deliver), behind two thin entrypoints — an **MCP** I run inside my own Claude,
and a scheduled **worker** that runs the before/after cycle on its own. One
load-bearing seam: the **cairn** store, which is the privacy boundary, the
free→premium boundary, and the test boundary all at once. Everything else stays
concrete until a test makes me promote it.
