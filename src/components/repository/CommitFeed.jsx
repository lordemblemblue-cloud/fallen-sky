import React from "react";
import { formatDateTime } from "./format";

export default function CommitFeed({ commits }) {
  if (!commits?.length) {
    return <p className="px-2 py-6 text-center text-sm text-muted-foreground">No commits yet.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {commits.map((commit) => (
        <li key={commit.sha} className="flex gap-3 px-2 py-3">
          {commit.avatarUrl ? (
            <img
              src={commit.avatarUrl}
              alt=""
              className="mt-0.5 h-6 w-6 shrink-0 rounded-full border border-border"
            />
          ) : (
            <div className="mt-0.5 h-6 w-6 shrink-0 rounded-full border border-border bg-muted" />
          )}
          <div className="min-w-0 flex-1">
            <a
              href={commit.url}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-sm text-foreground hover:underline"
              title={commit.message}
            >
              {commit.message || "(no message)"}
            </a>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] text-muted-foreground">
              <span>{commit.author}</span>
              <span aria-hidden>·</span>
              <span>{commit.sha}</span>
              <span aria-hidden>·</span>
              <span>{formatDateTime(commit.date)}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}