# Triggers — how a requirement starts the SDLC

How new work enters JoadT. A **requirement** (from anywhere) is normalized and handed to the
**orchestrator**, which runs the SDLC on the target repo and opens a PR. Requirement *sources* are
adapters; the engine is one.

```
   GitHub issue label  ┐
                       ├──▶  Requirement  ──▶  JoadT orchestrator  ──▶  PR on the target repo
   Jira scan (ent.)    ┘        (normalized)        (triage → plan → build → review gate)
```

## The requirement-source abstraction

Build this once; every source is an adapter into it.

```json
{
  "source": "github" | "jira",
  "key": "ORG/repo#42" | "CLAIMS-1234",
  "tentacle": "<repo it targets>",
  "title": "...",
  "description": "...",
  "acceptance_criteria": ["..."],
  "raw_url": "https://..."
}
```
The orchestrator only sees this shape — it doesn't care whether the requirement came from a GitHub
label or a Jira scan.

---

## (a) GitHub issue label

**Master model — built & proven (today).** A repo carries a caller workflow referencing
`sdlc-templates`; labeling an issue fires it.
```
file issue → add `requirement` (single-agent) or `requirement-parallel` (fan-out) label
→ repo's caller workflow → triage → [human gate] → plan → build agents → PR on the repo
```
Proven live: tablee issue #7's parallel run succeeded (triage → plan → 3 fenced build agents).

**Hub model — to build (the no-master direction).** The repo carries *nothing*; JoadT reaches in.
```
file issue on a target repo → add `requirement` label
→ GitHub App webhook → JoadT POST /api/webhook (signature-verified)   ← receiver exists
→ route issues(labeled) to the orchestrator                            ← TODO
→ JoadT clones the target, runs triage → plan → build in its own context
→ opens the PR on the target via the installation token
```
Status: `/api/webhook` verifies events; the `issues.labeled → orchestrator` routing is the next build.

---

## (b) Jira scan (enterprise)

Requirements often live in Jira, not GitHub. Same engine, a Jira adapter.

**At the octopus head — one central connection.**
- Connect Jira once: base URL + auth (Jira Cloud API token / OAuth; Data Center PAT).
- Stored in JoadT config (secret manager in enterprise). This is the single integration point.

**Per tentacle — a mapping.**
- Each repo ↔ a Jira project / board / **JQL filter**.
- e.g. `project = CLAIMS AND issuetype = Requirement AND status = "Ready for Dev"`.

**Per tentacle — a "Scan Jira" action.**
```
run the tentacle's JQL
→ find NEW requirements (match the filter, not already processed)
→ ingest each → normalize to the requirement shape (title · description · acceptance criteria)
→ hand to the orchestrator (a Jira issue == a labeled GitHub issue)
→ write back to Jira: transition → "In Progress", comment the PR link,
   → "In Review" when the PR opens
→ mark processed (a Jira label or local state) so it never re-fires
```

**Trigger shapes.** On-demand **Scan** button · scheduled **poll** (JoadT cron) · **Jira webhook → JoadT**.

---

## Enterprise flags (for both, but acute for Jira)

- **PHI / data governance.** Jira requirement text (claims/healthcare) may contain PHI. Same rule as
  code: scrub before anything reaches the model; route Claude via **Bedrock/Vertex + BAA**
  (see [`PORTING-ENTERPRISE.md`](PORTING-ENTERPRISE.md)).
- **Least-privilege scopes.** Jira: read requirements + comment/transition only. GitHub App: the
  scopes in [`app/manifest.json`](../app/manifest.json), granted per-repo.
- **Human gates unchanged.** AI never merges/deploys; the requirement flow ends at a PR for review.
- **Dedup + audit.** Every triggered run is traceable back to its requirement key (GitHub # or Jira
  key); processed-markers prevent double-triggering.

---

## Build order

1. **Hub (a):** route `/api/webhook` `issues.labeled` → orchestrator (clone target → SDLC → PR).
   This makes the no-master requirement trigger real.
2. **Requirement-source abstraction:** normalize GitHub + (later) Jira into the one shape.
3. **Jira adapter (b):** head connection → per-tentacle JQL mapping → Scan action → writeback.
4. **Scheduling/webhooks:** move Jira from on-demand Scan to poll/webhook once proven.
