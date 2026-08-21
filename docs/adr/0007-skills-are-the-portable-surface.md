# Skills are the portable surface

joshua421's practices ship as **Agent Skills** — `skills/<name>/SKILL.md` folders in the
[agentskills.io](https://agentskills.io/specification) format — authored once and served twice:
as files any skills-compatible agent can install (Claude Code, Claude, Codex, Cursor, Copilot,
Gemini CLI, Goose, …), and over MCP as `skill://joshua421/<name>` resources plus one
`load_skill` tool, so a client that never touches the filesystem still gets them.

## Why

The persona is one block of instructions injected at connect. It carries the fixed centre, the
register, the loop, the week, the seasons and the ways-in bank — all of it, in every
conversation, whether the person is offering a Tuesday morning or weighing a decision they have
carried for a month. The centre belongs everywhere; the practices do not. **Progressive
disclosure** is the whole argument: metadata always, instructions on activation, references on
demand. A lament that can afford 200 lines because it only loads on the hard evening is a better
lament than the two sentences that are all a monolithic persona can spare it.

The format decision is downstream of that. Agent Skills is the one packaging every agent the
person might reflect in already reads, and MCP's own Skills Over MCP working group
([SEP-2640](https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2640)) converged on
serving that same content through existing Resources primitives rather than inventing a
primitive — it explicitly delegates the content format to agentskills.io. So one authored file
satisfies both surfaces, and the MCP half needs no protocol feature that isn't already in the
pinned SDK.

`load_skill` exists because resources are pull, not push. Claude Desktop — where the daily
reflection actually happens — does not read a resource unless a person attaches it, and someone
mid-reflection will not. A tool is the one surface every MCP client puts in front of the model
without ceremony, so the index of skills rides in its **description**, generated at startup from
the frontmatter on disk. Discovery then costs one line per skill in `tools/list`, and cannot
drift from the files.

## This is not a menu

"Don't present a menu" is in the fixed centre, and it still holds: **skills load into the
assistant, not in front of the person.** The person is still offered two ways in, varied, with
the door left open. A skill is what the assistant reads *after* they choose — the shape of the
practice, not a list of practices to pick from. Nothing in `skills/` may be read aloud as
options. (Recorded here because the surface makes the wrong version easy, and it should not have
to be re-argued.)

## What was given up

**A single file to read.** The companion's instructions now live in two places by design:
`core/persona.ts` (who you are, always) and `skills/` (how this practice goes, on demand). The
seam is load-bearing — put the centre in a skill and it is absent until something activates;
put a practice in the persona and it is present when nobody asked. The rule: **anything that
must be true before the first word is persona; anything true only once a direction is chosen is
a skill.**

**One copy of the fixed centre.** A skill folder installs and runs with no server connected, so
it cannot reference a constant in TypeScript — the register is the product, and a practice that
ships without it is worse than no practice. So `FIXED_CENTRE` is *stamped* into each `SKILL.md`
between generated markers by `npm run skills:build`, and a test asserts the stamp matches
`persona.ts`. Generated duplication with an assertion, not authored duplication.

## Rejected

- **Wait for SEP-2640 to land.** The extension is experimental and the SDK has no `skills`
  capability, but nothing in this decision needs one: files are a published standard today, and
  resources plus a tool are core MCP. Adopting the extension later is a capability declaration,
  not a rewrite.
- **Slim the persona to pointers now.** Its own contract is that the *whole* conversation is in
  character before any tool fires; reduced to "load a skill for the rest," the opening — the
  part that has to sound like a friend — goes out of character until something activates. The
  persona keeps its body; it gains one paragraph on when to load a skill. Slimming is a later
  decision, made against a real transcript.
- **A skill per way-in from the bank** (thanks, stillness, intercession, Scripture). Eight
  near-identical files whose whole content is one question and the centre they already share.
  Skills earn their keep where a practice has a *shape* — an order, a refusal, a place it
  characteristically goes wrong.
- **Logging which practice was used.** The Marker is empty by construction, and "he prayed
  Lament on Tuesday" is exactly the content Promise 1 refuses to hold.

## Consequences

- Skill bodies are authored prose, held to the persona's register — they are persona work, not
  configuration, and are edited by a single hand.
- `skills/` is resolved by file location, never cwd — Claude Desktop launches the server from an
  arbitrary directory — and must ship with the built package, or the resources are empty in the
  one client that matters most.
- Third-party skills installed into `.agents/skills/` are unrelated to this decision and are
  never served: joshua421 exposes only what it authored.
- The licence travels: each `SKILL.md` carries `license` frontmatter, because a skill folder is
  copied out of the repo by design.
