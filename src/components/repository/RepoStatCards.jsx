import React from "react";
import { GitFork, GitPullRequest, CircleDot, Star, Eye } from "lucide-react";
import { formatNumber } from "./format";

const CARDS = [
  { key: "stars", label: "Stars", icon: Star },
  { key: "forks", label: "Forks", icon: GitFork },
  { key: "watchers", label: "Watchers", icon: Eye },
  { key: "openIssues", label: "Open issues", icon: CircleDot },
  { key: "openPullRequests", label: "Open pull requests", icon: GitPullRequest },
];

export default function RepoStatCards({ stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {CARDS.map(({ key, label, icon: Icon }) => (
        <div key={key} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-foreground">
            {formatNumber(stats?.[key])}
          </p>
        </div>
      ))}
    </div>
  );
}