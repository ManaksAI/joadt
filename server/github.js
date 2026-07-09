// JoadT as a GitHub App — the "plug". Installing the app on a repo = plugging it into a
// tentacle. This module authenticates as the app and lets the control plane list the repos
// it's installed on (the roster, straight from GitHub) and act on any of them via an
// installation token. No master repo, no caller files — the repo just grants access.
//
// Config (env): GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY (PEM; \n-escaped is fine).
// Until those are set, appConfigured() is false and the control plane falls back to the
// local registry — so nothing breaks before the app is registered.
import { App } from "@octokit/app";

const APP_ID = process.env.GITHUB_APP_ID;
const PRIVATE_KEY = (process.env.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n");

export const appConfigured = () => Boolean(APP_ID && PRIVATE_KEY);

let _app = null;
const app = () => {
  if (!appConfigured()) return null;
  if (!_app) _app = new App({ appId: APP_ID, privateKey: PRIVATE_KEY });
  return _app;
};

// Every repo the app is installed on — the tentacle roster, sourced from GitHub.
export async function installedRepos() {
  const a = app();
  if (!a) return [];
  const repos = [];
  for await (const { repository: r } of a.eachRepository.iterator()) {
    repos.push({
      tentacle: r.name,
      full_name: r.full_name,
      remote: r.clone_url,
      private: r.private,
      default_branch: r.default_branch,
      installed: true,
    });
  }
  return repos;
}

// An octokit authenticated as the installation on a specific repo — used to act on it
// (open PRs, comment, push branches) with the app's granted permissions.
export async function repoClient(owner, repo) {
  const a = app();
  if (!a) throw new Error("GitHub App not configured");
  const { data } = await a.octokit.request(
    "GET /repos/{owner}/{repo}/installation", { owner, repo });
  return a.getInstallationOctokit(data.id);
}
