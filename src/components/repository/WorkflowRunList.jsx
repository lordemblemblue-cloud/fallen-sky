import React from "react";
import { CheckCircle2, CircleDot, XCircle, Loader2 } from "lucide-react";
import { formatDateTime } from "./format";

function StatusIcon({ status, conclusion }) {
  if (status !== "completed") return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-chart-2" />;
  if (conclusion === "success") return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-chart-1" />;
  if (conclusion === "failure") return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />;
  return <CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />;
}

export default function WorkflowRunList({ runs }) {
  if (!runs?.length) {
    return <p className="px-2 py-6 text-center text-sm text-muted-foreground">No workflow runs recorded.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {runs.map((run) => (
        <li key={run.id} className="flex gap-3 px-2 py-3">
          <StatusIcon status={run.status} conclusion={run.conclusion} />
          <div className="min-w-0 flex-1">
            <a
              href={run.url}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-sm text-foreground hover:underline"
              title={run.name}
            >
              {run.name}
            </a>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <span>{run.branch ?? "—"}</span>
              <span aria-hidden>·</span>
              <span>{run.conclusion ?? run.status}</span>
              <span aria-hidden>·</span>
              <span>{formatDateTime(run.updatedAt)}</span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}