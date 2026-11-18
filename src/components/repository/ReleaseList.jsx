import React from "react";
import { Tag } from "lucide-react";
import { formatDate } from "./format";

export default function ReleaseList({ releases }) {
  if (!releases?.length) {
    return <p className="px-2 py-6 text-center text-sm text-muted-foreground">No releases published.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {releases.map((release) => (
        <li key={release.tag} className="flex gap-3 px-2 py-3">
          <Tag className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <a
              href={release.url}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-sm text-foreground hover:underline"
              title={release.name}
            >
              {release.name}
            </a>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <span>{release.tag}</span>
              <span aria-hidden>·</span>
              <span>{formatDate(release.publishedAt)}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}