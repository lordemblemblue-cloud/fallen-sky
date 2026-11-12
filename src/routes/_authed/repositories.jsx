import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import PageHeading from "@/components/dashboard/PageHeading";
import Panel from "@/components/dashboard/Panel";
import PreviewNotice from "@/components/dashboard/PreviewNotice";
import RepoList from "@/components/dashboard/RepoList";
import LoadingRows from "@/components/dashboard/LoadingRows";
import { PREVIEW } from "@/components/dashboard/preview-data";
import { Input } from "@/components/ui/input";
import { listGitHubRepos } from "@/lib/server-fns";

export const Route = createFileRoute("/_authed/repositories")({
  head: () => ({ meta: [{ title: "Repositories · GitSync Pro" }] }),
  component: Repositories,
});

function Repositories() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["github", "repos"], queryFn: () => listGitHubRepos() });

  const connected = !!data?.connected;
  const repos = connected ? data.repos : PREVIEW.repos;
  const needle = search.trim().toLowerCase();
  const visible = needle
    ? repos.filter(
        (repo) =>
          repo.full_name.toLowerCase().includes(needle) ||
          (repo.description ?? "").toLowerCase().includes(needle) ||
          (repo.language ?? "").toLowerCase().includes(needle),
      )
    : repos;

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Repositories"
        title="Everything you maintain"
        description="Sorted by the most recent push, with language, stars and open work for each repository."
      />

      {!isLoading && !connected && <PreviewNotice />}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter by name, description or language"
          className="pl-9"
        />
      </div>

      <Panel>
        {isLoading ? <LoadingRows rows={6} /> : <RepoList repos={visible} />}
      </Panel>
    </div>
  );
}