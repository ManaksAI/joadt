# JoadT as a GitHub App — setup

JoadT is a **hub, not a master repo.** A repo joins the platform by **installing the JoadT
GitHub App** on it — that's the whole "plug it into a tentacle." The repo carries no workflows,
no `uses:` reference, nothing. JoadT reaches in from its own side using the app's token.

```
JoadT (this repo + the App)
   │  install the App on a repo   ← the only thing the repo does
   ▼
JoadT lists it as a tentacle, clones it, explores/preps it, runs the SDLC, opens PRs — via the
app's installation token. No master. No caller files.
```

Permissions the app requests (see [`app/manifest.json`](../app/manifest.json)):
`contents:write` · `pull_requests:write` · `issues:write` · `checks:read` · `actions:write` ·
`metadata:read`. Events: `issues` · `pull_request` · `installation` · `installation_repositories`.

## 1. Register the app (org admin, one-time)

GitHub → **Org Settings → Developer settings → GitHub Apps → New GitHub App**, then:

- **Name:** JoadT
- **Homepage URL:** your JoadT repo URL
- **Webhook URL:** `https://<where-joadt-runs>/api/webhook` (can be disabled for now if JoadT
  isn't publicly reachable yet — enable it once you wire event-driven runs)
- **Webhook secret:** generate one; you'll set it as `GITHUB_WEBHOOK_SECRET`
- **Permissions & events:** match `app/manifest.json` above
- Uncheck "Active" on the webhook if you have no public URL yet.

Create the app, then on its settings page:
- note the **App ID**
- **Generate a private key** (downloads a `.pem`)

## 2. Give JoadT the credentials

Set these where JoadT runs (locally in `.env`, or as CI/hosting secrets):

```bash
GITHUB_APP_ID=<the app id>
GITHUB_APP_PRIVATE_KEY="<contents of the .pem, newlines as \n or a real multiline value>"
GITHUB_WEBHOOK_SECRET=<the webhook secret>
```

Until these are set, JoadT runs in **local mode** — the roster comes from `tentacles/` and
`/api/installations` reports `{ configured: false }`. Nothing breaks; the App layer is additive.

## 3. Plug in a repo

Install the app on a repo (App page → **Install App** → pick the repo), or:

```
https://github.com/apps/joadt/installations/new
```

That's it — the repo is now a tentacle. Verify:

```bash
curl -s http://localhost:8790/api/installations | jq
# → { "configured": true, "repos": [ { "tentacle": "...", "remote": "...", "installed": true } ] }
```

## What runs where

- **`server/github.js`** — authenticates as the app, lists installed repos (`installedRepos()`),
  and mints an installation client to act on a repo (`repoClient(owner, repo)`).
- **`GET /api/installations`** — the roster, sourced from GitHub.
- **`POST /api/webhook`** — verified receiver for app events (installs, issues, PRs). Routing to
  the orchestrator is the next increment.

## Next (not yet built)

- Roster in the UI reads `/api/installations` when the app is configured.
- Webhook events drive the orchestrator: `issues.labeled` on a target repo → JoadT clones it,
  runs plan → build agents → opens a PR **on that repo** via the installation token.
- Move the SDLC engine out of `sdlc-templates` and into JoadT (retire the master).
