import React from "react";
import { AlertTriangle, Link2Off, Loader2 } from "lucide-react";

export default function LiveStateNotice({ status, message }) {
  if (status === "loading" || status === "refreshing") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading live repository data from GitHub…
      </div>
    );
  }

  const Icon = status === "not-connected" ? Link2Off : AlertTriangle;
  const title = status === "not-connected" ? "GitHub is not connected" : "Could not read live repository data";

  return (
    <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="text-sm">
        <p className="font-medium text-foreground">{title}</p>
        <p className="mt-1 text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}