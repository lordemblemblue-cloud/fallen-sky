import React, { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, RefreshCw } from "lucide-react";
import { getRepositoryActivity } from "@/lib/server-fns";
import { Button } from "@/components/ui/button";
import Panel from "./Panel";
import RepoStatCards from "./RepoStatCards";
import CommitFeed from "./CommitFeed";
import WorkItemList from "./WorkItemList";
import WorkflowRunList from "./WorkflowRunList";
import ReleaseList from "./ReleaseList";
import BranchList from "./BranchList";
import LiveStateNotice from "./LiveStateNotice";
import { formatDate, formatDateTime } from "./format";

const FALLBACK_REPO = "lordemblemblue-cloud/fallen-sky";

export default function RepoDashboard() {
  const loadActivity = useServerFn(getRepositoryActivity);
  const [state, setState] = useState({ phase: "loading", data: null, message: null });

  const refresh = useCallback(async () => {
    setState((prev) => ({ phase: prev.data ? "refreshing" : "loading", data: prev.data, message: null }));
    try {
      const result = await loadActivity();
      if (result?.ok) {
        setState({ phase: "ready", data: result, message: null });
        return;
      }
      if (result?.state === "not-connected") {
        setState({
          phase: "not-connected",
          data: null,
          message: "Reconnect the GitHub account to show this repository again.",
        });
        return;
      }
      setState({
        phase: "repository-error",
        data: null,
        message: `GitHub returned ${result?.status ?? "an error"} for ${FALLBACK_REPO}. Check that the connected account can still see this repository.`,
      });
    } catch (error) {
      setState({
        phase: "error",
        data: null,
        message: error?.message || "The live GitHub request failed. Try refreshing.",
      });
    }
  }, [loadActivity]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const data = state.data;
  const repo = data?.repository;
  const stats = data?.stats;
  const busy = state.phase === "loading" || state.phase === "refreshing";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              GitHub · live repository
            </p>
            <h1 className="mt-2 truncate font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              {repo?.fullName ?? FALLBACK_REPO}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {repo?.description || "Statistics and activity read directly from GitHub."}
            </p>
            {repo && (
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted-foreground">
                <span>{repo.visibility}</span>
                <span aria-hidden>·</span>
                <span>{repo.defaultBranch}</span>
                {repo.language && (
                  <>
                    <span aria-hidden>·</span>
                    <span>{repo.language}</span>
                  </>
                )}
                <span aria-hidden>·</span>
                <span>last push {formatDate(repo.pushedAt)}</span>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide ${
                data ? "border-chart-1/40 bg-chart-1/10 text-chart-1" : "border-border bg-muted text-muted-foreground"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${data ? "bg-chart-1" : "bg-muted-foreground"}`} />
              {data ? "live" : "offline"}
            </span>
            <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {repo?.url && (
              <Button asChild variant="ghost" size="sm">
                <a href={repo.url} target="_blank" rel="noreferrer">
                  GitHub
                  <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            )}
          </div>
        </header>

        <div className="mt-6 space-y-4">
          {state.phase !== "ready" && state.phase !== "refreshing" && (
            <LiveStateNotice status={state.phase} message={state.message} />
          )}

          {data && (
            <>
              <RepoStatCards stats={stats} />

              <div className="grid gap-4 lg:grid-cols-3">
                <Panel title="Recent commits" count={data.commits.length} className="lg:col-span-2">
                  <CommitFeed commits={data.commits} />
                </Panel>
                <div className="flex flex-col gap-4">
                  <Panel title="Pull requests" count={data.pullRequests.length}>
                    <WorkItemList kind="pull" items={data.pullRequests} emptyText="No pull requests yet." />
                  </Panel>
                  <Panel title="Issues" count={data.issues.length}>
                    <WorkItemList kind="issue" items={data.issues} emptyText="No open issues." />
                  </Panel>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Panel title="Workflow runs" count={data.workflowRuns.length}>
                  <WorkflowRunList runs={data.workflowRuns} />
                </Panel>
                <Panel title="Releases" count={data.releases.length}>
                  <ReleaseList releases={data.releases} />
                </Panel>
                <Panel title="Branches" count={data.branches.length}>
                  <BranchList branches={data.branches} defaultBranch={repo?.defaultBranch} />
                </Panel>
              </div>

              <p className="pt-1 text-center font-mono text-[11px] text-muted-foreground">
                Live data from GitHub · updated {formatDateTime(data.fetchedAt)}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}