# Porting JoadT to an enterprise (HIPAA / GitHub Enterprise)

A runbook for deploying the JoadT **hub** into a regulated enterprise. Hand this to whoever owns
the rollout. JoadT is a hub, not a master repo — a repo joins by **installing the JoadT GitHub
App** (see [`SETUP-APP.md`](SETUP-APP.md)); this doc covers the *enterprise* delta.

> The hub itself is the easy part. ~80% of the effort here is enterprise plumbing —
> model-access-under-a-BAA, security review, hosting, SSO, and network ingress — none of it
> JoadT-specific. Do §A first; it's the gating item.

---

## What you're deploying

```
JoadT = a GitHub App  +  a service (control-plane server + UI)  +  the agents (Claude)
                              ↑ runs on your infra              ↑ via your approved cloud
```
A target repo installs the App (access grant only) → JoadT clones it, runs the SDLC via the
installation token, opens PRs on it. No master, no caller files in the repo.

---

## §A. Model access — the gating item (and, for you, HIPAA)

Your repos are healthcare/claims (837P/837I, CMS1500, residency). So **the agents must never send
PHI — or sensitive code — to the public Anthropic API.** Route Claude through a HIPAA-eligible path:

- **Amazon Bedrock** (Claude models, HIPAA-eligible under your AWS BAA), or
- **Google Vertex AI** (Claude models, under your GCP BAA), or
- an **enterprise Anthropic agreement** with zero-retention + a BAA.

Claude Code / the agents support this via env — no code rewrite:
```bash
# Bedrock
CLAUDE_CODE_USE_BEDROCK=1
AWS_REGION=us-east-1            # + OIDC/role creds (see §D)
# or Vertex
CLAUDE_CODE_USE_VERTEX=1
CLOUD_ML_REGION=us-east5
ANTHROPIC_VERTEX_PROJECT_ID=...
```
Get this **agreed and signed (BAA) before anything else** — security review will block on it.

**Hard rule to enforce in the pipeline:** no PHI reaches the model. The analysis/plan phases send
issue text + a file listing; the build agents read repo *code*. Confirm your repos don't embed PHI
in code/fixtures/tests, and add a scan (gitleaks + a PHI pattern check) as a pre-flight gate.

---

## §B. The GitHub App in enterprise

- **Register it org-owned**, not on a personal account, so it survives staff changes: Enterprise/
  Org → Settings → Developer settings → GitHub Apps → New.
- **Least privilege — start smaller than [`app/manifest.json`](../app/manifest.json).** Begin with
  `metadata:read`, `issues:read/write`, `checks:read` (analysis-only). Add `contents:write` +
  `pull_requests:write` **per-repo, deliberately**, on low-risk services first.
- **Security review:** expect scrutiny of the write scopes and the webhook. Document why each
  permission is needed; be ready to demo the human gates (§E).
- **Installation approval:** on managed enterprises, installing an app on repos may require org-
  admin approval and an internal app-review. Budget for that.
- **GitHub Enterprise Server (self-hosted GHES)** vs Cloud: if GHES, set the API base URL for the
  octokit app client (`new App({ ..., Octokit: Octokit.defaults({ baseUrl: "https://ghes.host/api/v3" }) })`)
  and ensure webhooks reach the hub inside your network.

---

## §C. Hosting the hub

The localhost prototype (Express + Vite) is not deployable as-is. Two shapes:

1. **Service (always-on):** containerize (Docker) and run on your platform (Kubernetes / ECS /
   an internal VM). Needs an **ingress reachable by GitHub webhooks** — a public endpoint, or
   GHES-internal, through the corporate proxy/firewall. Put the UI behind SSO.
2. **Actions-driven (less infra):** the orchestration runs inside GitHub Actions in the JoadT repo,
   triggered by `repository_dispatch` from a thin webhook relay. Avoids an always-on service;
   good first step. The UI can be a static build served internally, read-only.

Either way: **build the frontend** (`npm run build` → static assets) and serve it internally; the
control-plane server needs outbound to GitHub + your model endpoint, and inbound only for webhooks.

---

## §D. Identity & secrets

- App private key, webhook secret, model creds → the **enterprise secret manager** (Vault / AWS
  Secrets Manager / GCP Secret Manager). Never `.env` in the enterprise.
- Prefer **OIDC → cloud role** over long-lived keys (esp. for Bedrock/Vertex): the hub assumes a
  role at runtime, no static AWS/GCP keys.
- **SSO/SAML** on the UI and the App. Scope the App and any PAT/OIDC minimally.
- Pin third-party GitHub Actions to **commit SHAs**, not tags; enable Dependabot on JoadT itself.

---

## §E. Governance, gates & audit

- **AI never merges or deploys** (already the design). Enforce with **org rulesets** on target
  repos: required status checks, **CODEOWNERS** review, N approvals, linear history — so neither a
  human nor an agent can merge unreviewed.
- **Stage the autonomy:** analysis-only across all repos first (cheap, high-signal); enable the
  build agents on one or two low-risk services; expand as trust builds.
- **Audit:** every agent action lands in Actions logs + PR history. Ship those to your central
  logging/SIEM. Keep the human merge/deploy gates non-negotiable.
- **Cost controls:** cheap model for triage/plan, strong for build; cap `--max-turns`; monitor
  spend per repo; the pipeline is label/event-gated so cost is opt-in.

---

## §F. PHI & data-handling checklist

- [ ] Model access is HIPAA-eligible (Bedrock/Vertex + BAA), zero-retention confirmed.
- [ ] Pre-flight scan blocks PHI/secrets from reaching the model (gitleaks + PHI patterns).
- [ ] Repos audited: no PHI in code, fixtures, test data, or issue templates.
- [ ] Logs/telemetry from JoadT contain no PHI (scrub agent I/O in logs).
- [ ] Data-flow documented for security: what leaves the network, to where, under which agreement.
- [ ] Least-privilege app scopes; write access granted per-repo, reviewed.

---

## Deploy sequence

1. **§A** — get model access approved (Bedrock/Vertex + BAA); set the env flags.
2. Transfer JoadT into an **enterprise repo**.
3. **§B** — register the org-owned App (least-privilege), pass security review.
4. **§C/§D** — containerize + deploy; secrets → secret manager; SSO on the UI.
5. Wire webhooks through your ingress.
6. **Pilot:** install on one low-risk repo, run analysis-only, prove the loop.
7. Add build-agent scope on the pilot; enforce rulesets; expand repo by repo.

---

## Build vs. buy (be honest at this gate)

An enterprise will weigh JoadT against **GitHub's native agent features + Backstage**. JoadT earns
its place only if the properties you specifically need are: **no master coupling, self-hosted,
and full data control** — which, for HIPAA/claims work, they genuinely can be. If those aren't
hard requirements, buying is cheaper. Decide this *before* the hosting/security investment, not after.
