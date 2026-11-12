import { Link } from "@tanstack/react-router";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { cn } from "@/lib/utils";

export default function NavLinks({ orientation = "vertical" }) {
  return (
    <nav
      className={cn(
        "flex gap-1",
        orientation === "vertical" ? "flex-col" : "flex-row overflow-x-auto pb-1 [scrollbar-width:none]",
      )}
    >
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: !!item.exact }}
          activeProps={{ className: "border-border bg-accent text-foreground" }}
          className={cn(
            "flex shrink-0 items-center gap-2.5 rounded-lg border border-transparent text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground",
            orientation === "vertical" ? "px-3 py-2" : "px-3 py-2",
          )}
        >
          <item.icon className="h-4 w-4" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}