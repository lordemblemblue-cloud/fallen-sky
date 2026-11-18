// Server-only GitHub reads for the repository dashboard.
// The dashboard is scoped to one repository, chosen by the app owner, so every
// request path is built from this constant and never from caller input.
const GITHUB_API = "https://api.github.com";
export const GITHUB_REPOSITORY = "lordemblemblue-cloud/fallen-sky";

async function request(token, path) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "GitSync-Pro",
    },
  });
  if (!response.ok) return { ok: false, status: response.status };
  return { ok: true, data: await response.json() };
}

const list = (result) => (result.ok && Array.isArray(result.data) ? result.data : []);

function toCommit(commit) {
  return {
    sha: commit.sha?.slice(0, 7) ?? "",
    message: (commit.commit?.message ?? "").split("\n")[0],
    author: commit.author?.login ?? commit.commit?.author?.name ?? "unknown",
    avatarUrl: commit.author?.avatar_url ?? null,
    date: commit.commit?.author?.date ?? commit.commit?.committer?.date ?? null,
    url: commit.html_url,
  };
}

function toPullRequest(pull) {
  return {
    number: pull.number,
    title: pull.title,
    state: pull.merged_at ? "merged" : pull.state,
    draft: Boolean(pull.draft),
    author: pull.user?.login ?? "unknown",
    updatedAt: pull.updated_at,
    url: pull.html_url,
    comments: pull.comments ?? 0,
  };
}

function toIssue(issue) {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    author: issue.user?.login ?? "unknown",
    labels: (issue.labels ?? []).map((label) => label.name),
    createdAt: issue.created_at,
    url: issue.html_url,
  };
}

function toRelease(release) {
  return {
    tag: release.tag_name,
    name: release.name || release.tag_name,
    publishedAt: release.published_at,
    url: release.html_url,
  };
}

function toWorkflowRun(run) {
  return {
    id: run.id,
    name: run.name,
    branch: run.head_branch,
    status: run.status,
    conclusion: run.conclusion,
    updatedAt: run.updated_at,
    url: run.html_url,
  };
}

// Returns { ok: true, data } or { ok: false, status } when GitHub rejects the read.
export async function readRepositoryActivity(token) {
  const base = `/repos/${GITHUB_REPOSITORY}`;
  const search = (kind) =>
    request(token, `/search/issues?q=repo:${GITHUB_REPOSITORY}+is:${kind}+is:open&per_page=1`);

  const [repo, commits, pulls, issues, releases, branches, runs, openIssues, openPulls] = await Promise.all([
    request(token, base),
    request(token, `${base}/commits?per_page=12`),
    request(token, `${base}/pulls?state=all&per_page=8&sort=updated&direction=desc`),
    request(token, `${base}/issues?state=all&per_page=12&sort=updated&direction=desc`),
    request(token, `${base}/releases?per_page=6`),
    request(token, `${base}/branches?per_page=10`),
    request(token, `${base}/actions/runs?per_page=6`),
    search("issue"),
    search("pr"),
  ]);

  if (!repo.ok) return { ok: false, status: repo.status };

  const record = repo.data;
  return {
    ok: true,
    data: {
      repository: {
        fullName: record.full_name,
        description: record.description,
        url: record.html_url,
        defaultBranch: record.default_branch,
        visibility: record.private ? "private" : "public",
        language: record.language,
        pushedAt: record.pushed_at,
        createdAt: record.created_at,
        topics: record.topics ?? [],
      },
      stats: {
        stars: record.stargazers_count ?? 0,
        forks: record.forks_count ?? 0,
        watchers: record.subscribers_count ?? 0,
        openIssues: openIssues.ok ? openIssues.data.total_count : null,
        openPullRequests: openPulls.ok ? openPulls.data.total_count : null,
      },
      commits: list(commits).map(toCommit),
      pullRequests: list(pulls).map(toPullRequest),
      issues: list(issues).filter((issue) => !issue.pull_request).map(toIssue),
      releases: list(releases).map(toRelease),
      branches: list(branches).map((branch) => ({ name: branch.name, protected: Boolean(branch.protected) })),
      workflowRuns: (runs.ok ? runs.data.workflow_runs ?? [] : []).map(toWorkflowRun),
      fetchedAt: new Date().toISOString(),
    },
  };
}