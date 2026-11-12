import { formatDistanceToNow } from "date-fns";
import { GitFork, Lock, Star } from "lucide-react";
import { LANGUAGE_COLORS } from "@/components/dashboard/languages";

export default function RepoList({ repos = [] }) {
  if (repos.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">No repositories to show.</p>;
  }

  return (
    <ul className="divide-y divide-border/70">
      {repos.map((repo) => (
        <li key={repo.id ?? repo.full_name} className="py-3.5 first:pt-0 last:pb-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate font-mono text-sm text-foreground">
                {repo.private && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
                <span className="truncate">{repo.full_name}</span>
              </p>
              {repo.description && (
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{repo.description}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
                {repo.language && (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: LANGUAGE_COLORS[repo.language] ?? "hsl(var(--muted-foreground))" }}
                    />
                    {repo.language}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Star className="h-3 w-3" /> {repo.stargazers_count}
                </span>
                <span className="flex items-center gap-1">
                  <GitFork className="h-3 w-3" /> {repo.forks_count}
                </span>
                <span>{repo.open_issues_count} open</span>
              </div>
            </div>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground/80">
              {formatDistanceToNow(new Date(repo.pushed_at), { addSuffix: true })}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}