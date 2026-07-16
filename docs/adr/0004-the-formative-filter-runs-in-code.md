# The formative filter runs in code, not in the model

The memorial reads a range of the person's own calendar to find the body of work they can no longer see — the Sundays, the prayer meetings, the small groups. Selecting *which* events those are is done by a **deterministic title match in the adapter**. The model only ever receives the matches.

## Why

Not capability — **exposure**. `Diary.day()` shows the model one day, on purpose. A range read shows it a year: every medical appointment, every 1:1, every interview. Handing the model the year and asking it to pick out the formative ones would put a person's entire life into an LLM context to answer a question a regex answers.

design.md's Promise 1 governs what joshua421 *stores*; it has nothing to say about what the model *sees*, because until the memorial the answer was always "one day." This ADR is the answer to the question the design has not had to ask before.

joshua421's own code holding the year is not the same exposure: it already has calendar scope, under the person's own OAuth, and it keeps nothing.

## Consequences

The match list must be **wide across traditions**, because a hardcoded vocabulary privileges one — and design.md commits to "non-denominationally… no tradition privileged". *Church* and *cell group* are an evangelical calendar; a Catholic's says **Mass**, an Anglican's **Evensong**, a Quaker's **Meeting for Worship**, an Orthodox one **Liturgy**. Seed accordingly: church, mass, liturgy, evensong, service, worship, communion, meeting for worship, prayer, cell/connect/home/life group, bible study, small group, mentor. *Not* "study" (too generic — students) and not "youth" (a demographic, not a practice; it matches a soccer season).

**Never ask when the filter matches. Ask once when a year returns zero.** Twelve months with no formative event is not an empty life — it is a filter that does not speak this person's words, and the failure is otherwise silent and undiagnosable from their side.

A false positive is cheap (an event named "Prayer" that wasn't) and a false negative is invisible, which is why the zero case is the only one worth interrupting for.

This ADR exists because "just let the model pick them out, it's smarter than a regex" is true, obvious, and will be proposed. The regex is not there because it is better at reading titles. It is there so the model never sees the year.
