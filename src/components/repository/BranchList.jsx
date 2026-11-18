import React from "react";
import { GitBranch, Lock } from "lucide-react";

export default function BranchList({ branches, defaultBranch }) {
  if (!branches?.length) {
    return <p className="px-2 py-6 text-center text-sm text-muted-foreground">No branches found.</p>;
  }

  return (
    <ul className="divide-y divide-border">
      {branches.map((branch) => (
        <li key={branch.name} className="flex items-center gap-2 px-2 py-2.5">
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground" title={branch.name}>
            {branch.name}
          </span>
          {branch.name === defaultBranch && (
            <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              default
            </span>
          )}
          {branch.protected && <Lock className="h-3 w-3 text-muted-foreground" aria-label="protected" />}
        </li>
      ))}
    </ul>
  );
}