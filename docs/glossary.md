# joshua421 — glossary

joshua421 helps a follower of Jesus reflect on their day and set it before the Lord, and — with their approval — writes that into their own calendar. This file fixes the words. The design lives in [design.md](./design.md); decisions live in [adr/](./adr/).

## Language

### Whose thing is it

The Diary and the Journal both live in the person's calendar. They are distinguished by **authorship**, not by location — this is the distinction the code has historically blurred.

**Diary**:
The person's own calendar entries — their real events, authored by them. joshua421 reads these and, with approval, adds notes alongside their words; it never rewrites or deletes them.
_Avoid_: Calendar (ambiguous — the Journal lives there too), Schedule

**Journal**:
joshua421's own entries, authored by joshua421 and stored in the person's calendar.
_Avoid_: Store, Database, Log (the Log is one use of the Journal, not a synonym)

**Grounding**:
The person's own account of what they are asking God to grow in them and how they want to be met — in their words, editable by hand. The one piece of content joshua421 keeps, by their choice.
_Avoid_: Preferences (implies settings), Profile, Config, Memory

> The banned words are the ones the product keeps reaching for, because they are what a
> stranger would say. Copy addressed to the person may **explain** a term — "what you're
> asking God to grow in you, and how you want to be met" — but must not **rename** it.
> Parsers are the exception: a person's own Grounding may well be headed "Goals", and the
> cadence engine has to keep reading it.

### What the person names

**Intention**:
What the person is asking God to grow in them over a season, named by them, before God. A desire held — not a target hit, and not something joshua421 can score.
_Avoid_: Goal (productivity-coded), Objective, Target, KPI

**Orientation**:
What the person says helps when they come back after a stretch away — steady, reassure, space, or gentle. Theirs to name, in their Grounding; never inferred from how they behaved.
_Avoid_: Re-engagement style, Segment, Profile, Persona

**Disclosure**:
What the person tells the companion about their own practice. The only honest evidence joshua421 has about their walk — everything else it can observe is evidence about itself.
_Avoid_: Self-report, Tracking data, Check-in data

**Check-in**:
A conversation, at a rhythm, in which the person discloses how it has been — "how is it with your soul?" It is asked and answered, never measured.
_Avoid_: Review, Progress check, Audit

**Significant moment**:
A day the person marks as a landmark. A look-back leads with these rather than an even wash of days.
_Avoid_: Significant day (collides with Formative event), Milestone, Highlight

### What joshua421 notices

**Formative event**:
A recurring occasion that forms the person — church, a Bible study, a mentor catchup. It sits on their Diary, so joshua421 can see **that it happened** — never whether God met them in it, which only they know. For someone in full-time ministry the same event is also their work, and the Diary cannot tell the two apart.
_Avoid_: Significant day, Trigger, Anchor event

**Silence**:
Days since the person last reflected **with joshua421**. A fact about joshua421, never about their walk — joshua421 cannot see whether they opened their Bible, only whether they opened joshua421.
_Avoid_: Drift, Lapse, Absence, Churn, Disengagement

**Reflection**:
An occasion on which the person turned to God about a day, with the companion.
_Avoid_: Session, Interaction, Entry

**Marker**:
joshua421's record that a Reflection happened on a day — one per day, deliberately empty of content. What Silence is counted from, and the only thing the behavioural record is allowed to say.
_Avoid_: Log row (implementation), Tick, Tally, Check-mark

**Memorial**:
The accumulated record read as evidence of God's faithfulness — and the point of comparison a look-back measures against. Never a tally of what the person managed.
_Avoid_: History, Streak, Scorecard, Progress

**Drift**:
When the person stops. Answered with a cue — something already in their week that calls them back.
_Avoid_: Lapse, Churn, Falling off (and note: joshua421 cannot see drift; it can only see [Silence](#language))

**Dismissal**:
When the person has *not* stopped but cannot see it — they have been to church forty times and still say "I've done nothing." Answered with a witness, not a cue: the accusation is already being made, and only the Memorial refutes it.
_Avoid_: Discouragement, Low self-efficacy

**Rollup**:
A distillation of a period into a single entry — a week from its days, a month from its weeks, a season from its months.
_Avoid_: Summary (that is a single day's own entry), Digest, Report

### How the companion meets the person

**Companion**:
The persona joshua421 hands to the person's own assistant. joshua421 makes no model calls of its own, so the companion — not the server — is the product.
_Avoid_: Assistant (that is the host: Claude Desktop, ChatGPT, …), Bot, Agent, Chatbot

**Presence**:
How often the companion speaks, independent of whether the person has shown up. Set by their Rhythm.
_Avoid_: Frequency, Engagement, Cadence (that is the engine that decides, not the quality)

**Gentleness**:
How hard the companion presses. Set by their Grounding.
_Avoid_: Tone (broader), Intensity, Pressure

> Presence and Gentleness are **independent**. Gentle does not mean quiet, and a companion that goes quiet when someone drifts is not being gentle — it is being absent. Fusing these two is what produced a system that fell silent on a person who had asked in writing to be pressed.

**Rhythm**:
The days and kinds of nudge the person asked for.
_Avoid_: Schedule, Cadence, Frequency

**Ask**:
How much a nudge asks of the person — two questions, one, or none at all. The axis that carries Silence: the Ask scales, Presence holds.
_Avoid_: Effort, Difficulty, Intensity (that is Gentleness), Engagement

**Centre**:
The commitments in the Companion that never bend — grace over guilt, the Word as plumb line, the particular over the generic, discerning rather than pronouncing. Delivery flexes to the person; the Centre does not.
_Avoid_: Guardrails, Rules, Values (too broad), System prompt (that is where it ships, not what it is)

**Practice**:
A named shape a Reflection can take — an examen, a lament, a discernment, a memorial. The Companion loads one to know how that kind of conversation goes.
_Avoid_: Skill (that is the file format a Practice ships in), Exercise, Template, Mode, Menu item

> A Practice is loaded by the Companion, never offered to the person. The person is shown
> two ways in, in plain words — the list of Practices is not a menu and is never read aloud.
