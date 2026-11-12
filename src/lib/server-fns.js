import { createServerFn } from "@tanstack/react-start";
import { requireUser } from "@/lib/auth-middleware";

export const getServerInfo = createServerFn({ method: "GET" }).handler(async () => ({
  renderedAt: new Date().toISOString(),
}));

const GITHUB_API = "https://api.github.com";

// The GitHub connection belongs to the app builder (shared connector), so every
// handler below sits behind requireUser. A missing connection is not an error:
// the pages render their "not connected" state instead.
async function githubToken(context) {
  try {
    const connection = await context.getBase44().asServiceRole.connectors.getConnection("github");
    return connection?.accessToken ?? null;
  } catch {
    return null;
  }
}

async function ghJson(path, token) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "GitSync-Pro",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub request failed (${res.status})`);
  return res.json();
}

const REPOS_PATH =
  "/user/repos?per_page=100&sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member";

function mapRepo(repo) {
  return {
    id: repo.id,
    full_name: repo.full_name,
    description: repo.description,
    language: repo.language,
    stargazers_count: repo.stargazers_count ?? 0,
    forks_count: repo.forks_count ?? 0,
    open_issues_count: repo.open_issues_count ?? 0,
    pushed_at: repo.pushed_at,
    private: repo.private,
    html_url: repo.html_url,
  };
}

function mapThread(item) {
  return {
    id: item.id,
    number: item.number,
    title: item.title,
    repo: item.repository_url?.split("/repos/")[1] ?? "",
    draft: item.draft ?? false,
    labels: (item.labels ?? []).map((label) => (typeof label === "string" ? label : label.name)),
    updated_at: item.updated_at,
  };
}

function mapEvent(event) {
  const kindByType = {
    PushEvent: "commit",
    PullRequestEvent: "pull_request",
    IssuesEvent: "issue",
    ReleaseEvent: "release",
  };
  const kind = kindByType[event.type];
  if (!kind) return null;

  let title = "";
  if (event.type === "PushEvent") {
    title = event.payload?.commits?.[0]?.message?.split("\n")[0] ?? `Pushed to ${event.payload?.ref ?? "a branch"}`;
  } else if (event.type === "PullRequestEvent") {
    title = `${event.payload?.action} · ${event.payload?.pull_request?.title ?? "pull request"}`;
  } else if (event.type === "IssuesEvent") {
    title = `${event.payload?.action} · ${event.payload?.issue?.title ?? "issue"}`;
  } else {
    const release = event.payload?.release;
    title = `${release?.name || release?.tag_name || "release"} published`;
  }

  return {
    id: event.id,
    kind,
    title,
    repo: event.repo?.name ?? "",
    actor: event.actor?.login ?? "",
    at: event.created_at,
  };
}

export const getGitHubOverview = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const token = await githubToken(context);
    if (!token) return { connected: false };

    const profile = await ghJson("/user", token);
    if (!profile) return { connected: false };

    const [repos, pullRequests, issues, events] = await Promise.all([
      ghJson(REPOS_PATH, token),
      ghJson(`/search/issues?q=${encodeURIComponent("is:open is:pr author:@me")}&per_page=5&sort=updated`, token),
      ghJson(`/search/issues?q=${encodeURIComponent("is:open is:issue assignee:@me")}&per_page=5&sort=updated`, token),
      ghJson(`/users/${profile.login}/events?per_page=30`, token),
    ]);

    const repoList = (repos ?? []).map(mapRepo);
    const activity = (events ?? []).map(mapEvent).filter(Boolean).slice(0, 8);

    return {
      connected: true,
      profile: { login: profile.login, name: profile.name, avatar_url: profile.avatar_url },
      stats: {
        repos: repoList.length,
        stars: repoList.reduce((total, repo) => total + repo.stargazers_count, 0),
        openPullRequests: pullRequests?.total_count ?? 0,
        openIssues: issues?.total_count ?? 0,
      },
      repos: repoList.slice(0, 5),
      pullRequests: (pullRequests?.items ?? []).map(mapThread),
      issues: (issues?.items ?? []).map(mapThread),
      activity,
    };
  });

export const listGitHubRepos = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const token = await githubToken(context);
    if (!token) return { connected: false, repos: [] };

    const repos = await ghJson(REPOS_PATH, token);
    return { connected: true, repos: (repos ?? []).map(mapRepo) };
  });

export const listGitHubPullRequests = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const token = await githubToken(context);
    if (!token) return { connected: false, items: [] };

    const result = await ghJson(
      `/search/issues?q=${encodeURIComponent("is:open is:pr author:@me")}&per_page=30&sort=updated`,
      token,
    );
    return { connected: true, items: (result?.items ?? []).map(mapThread) };
  });

export const listGitHubIssues = createServerFn({ method: "GET" })
  .middleware([requireUser])
  .handler(async ({ context }) => {
    const token = await githubToken(context);
    if (!token) return { connected: false, items: [] };

    const result = await ghJson(
      `/search/issues?q=${encodeURIComponent("is:open is:issue assignee:@me")}&per_page=30&sort=updated`,
      token,
    );
    return { connected: true, items: (result?.items ?? []).map(mapThread) };
  });