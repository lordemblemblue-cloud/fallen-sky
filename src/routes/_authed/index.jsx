import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import PageHeading from "@/components/dashboard/PageHeading";
import Panel from "@/components/dashboard/Panel";
import PreviewNotice from "@/components/dashboard/PreviewNotice";
import StatCards from "@/components/dashboard/StatCards";
import ActivityList from "@/components/dashboard/ActivityList";
import RepoList from "@/components/dashboard/RepoList";
import LoadingRows from "@/components/dashboard/LoadingRows";
import { PREVIEW } from "@/components/dashboard/preview-data";
import { getGitHubOverview } from "@/lib/server-fns";

export const Route = createFileRoute("/_authed/")({
  head: () => ({ meta: [{ title: "Overview · GitSync Pro" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["github", "overview"],
    queryFn: () => getGitHubOverview(),
  });

  const connected = !!data?.connected;
  const view = connected ? data : PREVIEW;

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="GitHub overview"
        title="Your work, at a glance"
        description="Repositories, review load and open work pulled straight from your GitHub account."
      />

      {!isLoading && !connected && <PreviewNotice />}

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-muted-foreground">
          Couldn't reach GitHub. Refresh in a moment to try again.
        </div>
      )}

      <StatCards stats={view.stats} loading={isLoading} />

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          title="Recent activity"
          className="lg:col-span-3"
          action={
            <Link to="/repositories" className="font-mono text-[11px] text-muted-foreground hover:text-foreground">
              view repos →
            </Link>
          }
        >
          {isLoading ? <LoadingRows /> : <ActivityList items={view.activity} />}
        </Panel>

        <Panel
          title="Recently pushed"
          className="lg:col-span-2"
          action={
            <Link to="/repositories" className="font-mono text-[11px] text-muted-foreground hover:text-foreground">
              all →
            </Link>
          }
        >
          {isLoading ? <LoadingRows /> : <RepoList repos={view.repos} />}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="Waiting on review"
          action={
            <Link to="/pull-requests" className="font-mono text-[11px] text-muted-foreground hover:text-foreground">
              all →
            </Link>
          }
        >
          {isLoading ? <LoadingRows rows={3} /> : <MiniThreads items={view.pullRequests} />}
        </Panel>

        <Panel
          title="Open issues"
          action={
            <Link to="/issues" className="font-mono text-[11px] text-muted-foreground hover:text-foreground">
              all →
            </Link>
          }
        >
          {isLoading ? <LoadingRows rows={3} /> : <MiniThreads items={view.issues} />}
        </Panel>
      </div>
    </div>
  );
}

function MiniThreads({ items = [] }) {
  if (items.length === 0) return <p className="py-6 text-sm text-muted-foreground">Nothing open right now.</p>;
  return (
    <ul className="divide-y divide-border/70">
      {items.slice(0, 3).map((item) => (
        <li key={item.id} className="flex items-baseline gap-3 py-3 first:pt-0 last:pb-0">
          <span className="font-mono text-[11px] text-muted-foreground">#{item.number}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.title}</span>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {(item.repo ?? "").split("/")[1]}
          </span>
        </li>
      ))}
    </ul>
  );
}