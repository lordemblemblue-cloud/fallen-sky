import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

export default function ThreadList({ items = [], kind = "pull request" }) {
  if (items.length === 0) {
    return <p className="py-6 text-sm text-muted-foreground">No open {kind}s assigned to you.</p>;
  }

  return (
    <ul className="divide-y divide-border/70">
      {items.map((item) => (
        <li key={item.id ?? `${item.repo}-${item.number}`} className="flex items-start gap-3 py-3.5 first:pt-0 last:pb-0">
          <span className="mt-0.5 font-mono text-[11px] text-muted-foreground">#{item.number}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">{item.title}</p>
            <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
              {item.repo} · updated {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {item.draft && (
              <Badge variant="outline" className="border-border font-mono text-[10px] text-muted-foreground">
                draft
              </Badge>
            )}
            {(item.labels ?? []).slice(0, 2).map((label) => (
              <Badge
                key={label}
                variant="outline"
                className="border-border font-mono text-[10px] text-muted-foreground"
              >
                {label}
              </Badge>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}