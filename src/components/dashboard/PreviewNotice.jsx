import { Github } from "lucide-react";

export default function PreviewNotice() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-chart-4/30 bg-chart-4/[0.06] px-4 py-3">
      <Github className="mt-0.5 h-4 w-4 shrink-0 text-chart-4" />
      <p className="text-sm leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Sample data shown.</span> GitHub isn't connected yet — ask in the
        chat to connect your account and these numbers become your own repositories, issues and pull requests.
      </p>
    </div>
  );
}