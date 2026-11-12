import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import PageHeading from "@/components/dashboard/PageHeading";
import Panel from "@/components/dashboard/Panel";
import PreviewNotice from "@/components/dashboard/PreviewNotice";
import ThreadList from "@/components/dashboard/ThreadList";
import LoadingRows from "@/components/dashboard/LoadingRows";
import { PREVIEW } from "@/components/dashboard/preview-data";
import { listGitHubPullRequests } from "@/lib/server-fns";

export const Route = createFileRoute("/_authed/pull-requests")({
  head: () => ({ meta: [{ title: "Pull requests · GitSync Pro" }] }),
  component: PullRequests,
});

function PullRequests() {
  const { data, isLoading } = useQuery({
    queryKey: ["github", "pull-requests"],
    queryFn: () => listGitHubPullRequests(),
  });

  const connected = !!data?.connected;

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Pull requests"
        title="Open pull requests"
        description="Your open pull requests across every repository, most recently updated first."
      />
      {!isLoading && !connected && <PreviewNotice />}
      <Panel>
        {isLoading ? (
          <LoadingRows rows={5} />
        ) : (
          <ThreadList items={connected ? data.items : PREVIEW.pullRequests} kind="pull request" />
        )}
      </Panel>
    </div>
  );
}