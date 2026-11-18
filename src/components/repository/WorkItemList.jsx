import React from "react";
import { GitMerge, GitPullRequest, CircleDot } from "lucide-react";
import { formatDate } from "./format";

const TONE = {
  open: "border-chart-1/40 bg-chart-1/10 text-chart-1",
  merged: "border-chart-3/40 bg-chart-3/10 text-chart-3",
  closed: "border-border bg-muted text-muted-foreground",
};

export default function WorkItemList({ items, emptyText, kind = "pull" }) {
  if (!items?.length) {
    return <p className="px-2 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const Icon = kind === "issue" ? CircleDot : item.state === "merged" ? GitMerge : GitPullRequest;
        return (
          <li key={`${kind}-${item.number}`} className="flex gap-3 px-2 py-3">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="block text-sm text-foreground hover:underline"
                title={item.title}
              >
                <span className="line-clamp-2">{item.title}</span>
              </a>
              <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
                <span>#{item.number}</span>
                <span className={`rounded border px-1.5 py-0.5 ${TONE[item.state] ?? TONE.closed}`}>
                  {item.draft ? "draft" : item.state}
                </span>
                <span>{item.author}</span>
                <span aria-hidden>·</span>
                <span>{formatDate(item.updatedAt ?? item.createdAt)}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}