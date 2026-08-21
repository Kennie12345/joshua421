# Presence holds; the ask scales

Silence changes **how much the nudge asks of the person**. It never changes **whether the nudge comes**. The one exception is a 60-day dormancy, which thins to a weekly anchor, says so in the email, and is undone by a single reflection.

How someone wants to be met on the way back is **named by them** in the `begin` conversation, kept in their grounding as `Orientation: steady | reassure | space | gentle`, and editable by hand. It is never inferred — [ADR 0002](./0002-no-inferred-profile.md) settled that, and nothing here reopens it.

## Why

The previous design had the two axes the wrong way round: it held the ask constant and withdrew the presence. Past ten days of silence the cadence dropped to one email a week, and the only exit was a reflection — which required the email that was no longer coming. Five weeks of real dogfood produced **74 scheduled jobs and 4 sent emails**, all four on Sundays. The loop did not fail; it did exactly what it was told, and what it was told was a trap.

This was not a bug. It was "grace, not guilt" implemented so faithfully it became absence — and [glossary.md](../glossary.md) had already named the error:

> Presence and Gentleness are **independent**. Gentle does not mean quiet, and a companion that goes quiet when someone drifts is not being gentle — it is being absent. Fusing these two is what produced a system that fell silent on a person who had asked in writing to be pressed.

The attachment literature says the same thing about the thing being imitated. A **secure base** (Bowlby) is defined by *consistent availability*, not by intensity or by warmth on demand; in Ainsworth's separation-and-reunion work it is the caregiver's reliability **across** the absence that organises the child's strategy. Withdrawal-on-absence is not a neutral way to give someone room — it is the specific input that produces insecure organisation. A companion that goes quieter the longer you are away is teaching precisely the lesson it means to unteach.

What legitimately varies is the **demand**. Anxious (hyperactivating) and avoidant (deactivating) strategies are opposite responses to the same question — is it safe to need this? — and they want opposite things from a return (Mikulincer & Shaver). One needs to find everything exactly as it was; the other needs the door open and nothing asked. Both need the door to still be there. So the demand is the axis that moves, and presence is the axis that does not.

## The four orientations

| Grounding word | What a gap feels like | What the nudge does |
| --- | --- | --- |
| `steady` | a busy week | normal warmth; the ask thins only after heavy silence |
| `reassure` | ground lost, and maybe given up on | **the full ask, at every depth** — thinning it is what reads as abandonment. The opener says the non-contingent thing out loud: nothing changed, nothing to make up |
| `space` | being asked for is the demand | presence held, ask dropped to nothing: the day, the door, "no reply needed" |
| `gentle` | both at once | maximum predictability, minimum demand — light, then nothing |

`reassure` keeping the **full** ask is the counter-intuitive one and the most important. The instinct is that a long gap deserves a gentler, smaller email. For this person a smaller email is the feared event.

## The limit of the analogy

joshua421 is not a caregiver and this is not therapy. What is borrowed is one narrow, well-evidenced structural claim — *availability is the load-bearing variable, and demand is separable from it* — and nothing else. In particular:

- No orientation is a diagnosis, and none is ever said back to the person as a fact about them. They are four ways of being written to.
- The vocabulary is deliberately plain (`space`, not "dismissive-avoidant"). Clinical labels invite self-misdiagnosis in a spiritual onboarding conversation, and invite the companion to act as though it were assessing.
- The question that elicits it is behavioural and about *this* thing only: *"When you go quiet for a while and come back — what helps? Some people want to find everything as they left it. Others want plenty of room and no questions."*

## Rejected

**Inferring the orientation from behaviour.** ADR 0002 already forbids it and the numbers are decisive: best-case LLM inference of personality reaches max *r* = 0.27 with κ < 0.10 while ICC > 0.85 — consistently, confidently wrong. Attachment is also domain-differentiated (Sibley & Overall 2008; La Guardia et al. 2000), so there is no single style to find, and the only relationship joshua421 can observe is the one with itself — the one that does not matter. Non-response to an email is not data about a person's inner world. It is data about an inbox.

**Keeping a frequency backoff with a recovery ramp.** It preserves the guilt-pile intent while removing the spiral, and it was seriously considered. Rejected because it keeps presence on the table as something silence can take away, which is the exact thing the evidence says not to do — and because it needs state (how many unanswered weekly sends) that nothing else in the system requires.

**Doing nothing, on the grounds that unread mail is its own accusation.** Real, and the reason `space` exists and the reason every email still carries *"Fewer of these? Ask your assistant to adjust your rhythm."* But a pile of "the door is open" notes is a different object from a pile of "what went wrong today?" ones, and the person has an explicit lever either way. The rhythm is theirs to set; it is not ours to quietly override.

## Consequences

- `Rhythm:` owns frequency and is the person's explicit choice. `Orientation:` owns the weight of the ask. One knob each, no overlap — the previous design had silence secretly overriding the rhythm the person had written down in plain words.
- `CadenceDecision` gains `ask: 'full' | 'light' | 'none'`. The email's question block is what it moves; the day, the doors and the off-ramp are always present.
- An unset orientation behaves exactly as `steady`. Absent means absent — never guessed, per ADR 0002.
- Dormancy at 60 days is the single place presence thins, and the only place the system changes something the person did not ask for. It therefore **says so in the email** and names the way back, and one reflection restores the full rhythm immediately.
- Held by test, not intention (`core/cadence.test.ts`, `core/flows.test.ts`): eleven days of silence must still send; a welcome-back must never count days or name a lapse; `reassure` must keep both questions at any depth.
