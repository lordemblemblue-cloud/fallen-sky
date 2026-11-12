import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import PageHeading from "@/components/dashboard/PageHeading";
import Panel from "@/components/dashboard/Panel";
import PreviewNotice from "@/components/dashboard/PreviewNotice";
import ThreadList from "@/components/dashboard/ThreadList";
import LoadingRows from "@/components/dashboard/LoadingRows";
import { PREVIEW } from "@/components/dashboard/preview-data";
import { listGitHubIssues } from "@/lib/server-fns";

export const Route = createFileRoute("/_authed/issues")({
  head: () => ({ meta: [{ title: "Issues · GitSync Pro" }] }),
  component: Issues,
});

function Issues() {
  const { data, isLoading } = useQuery({ queryKey: ["github", "issues"], queryFn: () => listGitHubIssues() });
  const connected = !!data?.connected;

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Issues"
        title="Open issues"
        description="Open issues assigned to you across every repository, most recently updated first."
      />
      {!isLoading && !connected && <PreviewNotice />}
      <Panel>
        {isLoading ? <LoadingRows rows={5} /> : <ThreadList items={connected ? data.items : PREVIEW.issues} kind="issue" />}
      </Panel>
    </div>
  );
}