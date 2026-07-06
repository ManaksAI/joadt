# Phase-4 agent prompt — Consolidate learnings

> Runs ONCE, sequentially, after integration is green (before/with the release step). Reads
> every per-sandbox `.learnings/sandbox-*.md` scratch file and folds the keepers into the
> canonical log. This is the only place the learning log is WRITTEN.

## Why it's a single sequential step

During a run the log is read-only and each sandbox writes only its own scratch file, so there's
no contention. Consolidation is the deliberate, serialized merge — like `consolidate-memory` for
the project. Never let Phase-2 agents write the log directly.

## Prompt template

```
You are the Consolidation agent for the Tablée learning log. Run on the integration branch
after the wave's integration tests are green.

Inputs: every file matching .learnings/sandbox-*.md (this wave's per-sandbox captures).
Existing log: docs/learning-log/entries/ + docs/learning-log/INDEX.md.

Do this:

1. READ all .learnings/sandbox-*.md and the existing INDEX.md.
2. For each captured learning, decide:
   - DROP — narration, trivia, or "no new learnings". Discard.
   - MERGE — refines/extends an existing entry → edit that entry, don't create a duplicate.
   - NEW — a genuinely new, reusable lesson → create docs/learning-log/entries/YYYY-MM-DD-<slug>.md
     using the schema (front matter: date, slug, tags, requirement; sections: Approach,
     Bottleneck, How overcome, Alternatives, Outcome).
3. Keep entries FACTUAL and SPECIFIC (cite files/functions/errors). A future agent acts on these
   cold — no vague "be careful" advice.
4. Update INDEX.md: one line per entry — `- [<title>](entries/<file>.md) — <tags> — <hook>`.
5. Run the validator: `node scripts/validate-learning-log.mjs`. Fix anything it flags.
6. Stage the new/changed entries + INDEX.md. Do NOT commit the .learnings/ scratch (it's
   git-ignored and discarded).

Report: which captures became NEW entries, which were MERGED into existing ones, which were
DROPPED (and why), and the validator result.
```

## Notes

- Dedup is the whole point — three sandboxes hitting the same lesson should yield ONE entry.
- The validator (`scripts/validate-learning-log.mjs`) is the deterministic guardrail; wire it
  into CI (`make lint`) when ready so a malformed log fails the gate.
