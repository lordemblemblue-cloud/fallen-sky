import { CircleDot, FolderGit2, GitPullRequest, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const CARDS = [
  { key: "repos", label: "Repositories", icon: FolderGit2 },
  { key: "openPullRequests", label: "Open pull requests", icon: GitPullRequest },
  { key: "openIssues", label: "Open issues", icon: CircleDot },
  { key: "stars", label: "Stars earned", icon: Star },
];

export default function StatCards({ stats, loading = false }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {CARDS.map(({ key, label, icon: Icon }) => (
        <div
          key={key}
          className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-border/80 hover:bg-accent/30"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            <Icon className="h-4 w-4 text-muted-foreground/70" />
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-16" />
          ) : (
            <p className="mt-2 font-mono text-3xl font-medium tabular-nums tracking-tight text-foreground">
              {Number(stats?.[key] ?? 0).toLocaleString("en-US")}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}