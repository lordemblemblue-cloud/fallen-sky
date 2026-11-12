import { Outlet } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { Image } from "@/components/ui/image";
import { Button } from "@/components/ui/button";
import NavLinks from "@/components/layout/NavLinks";

const LOGO = "https://media.base44.com/images/public/6af625cd654fa5b8954442ce/d7d95bd81_logo.png";

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <Image src={LOGO} alt="GitSync Pro" fittingType="fit" className="h-8 w-8 rounded-md" />
      <div className="leading-tight">
        <p className="font-heading text-sm font-semibold tracking-tight text-foreground">GitSync Pro</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">GitHub insights</p>
      </div>
    </div>
  );
}

function AccountFooter() {
  const { user, logout } = useAuth();
  return (
    <div className="mt-auto border-t border-sidebar-border pt-4">
      <div className="flex items-center gap-2.5 px-1">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-secondary font-mono text-xs text-foreground">
          {(user?.full_name || user?.email || "?").slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{user?.full_name || "Account"}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">{user?.email}</p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => logout()}
        className="mt-2 w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </Button>
    </div>
  );
}

export default function AppShell() {
  return (
    <div className="relative min-h-screen bg-background">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,hsl(210_90%_60%/0.10),transparent_70%)]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-[1440px]">
        <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar-background px-4 py-6 lg:flex">
          <Brand />
          <NavLinks />
          <AccountFooter />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-border/70 bg-background/85 px-4 py-3 backdrop-blur lg:hidden">
            <Brand />
            <div className="mt-3">
              <NavLinks orientation="horizontal" />
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}