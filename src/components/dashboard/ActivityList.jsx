import { formatDistanceToNow } from "date-fns";
import { CircleDot, GitCommitHorizontal, GitPullRequest, Tag } from "lucide-react";

const ICONS = {
  commit: GitCommitHorizontal,
  pull_request: GitPullRequest,
  issue: CircleDot,
  release: Tag,
};

export default function ActivityList({ items = [] }) {
  return (
    <ul className="divide-y divide-border/70">
      {items.map((item) => {
        const Icon = ICONS[item.kind] ?? GitCommitHorizontal;
        return (
          <li key={item.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-secondary/60">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-foreground">{item.title}</p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {item.repo} · {formatDistanceToNow(new Date(item.at), { addSuffix: true })}
              </p>
            </div>
          </li>
        );
      })}
      {items.length === 0 && <li className="py-6 text-sm text-muted-foreground">No recent activity.</li>}
    </ul>
  );
}