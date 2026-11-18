import { createFileRoute } from "@tanstack/react-router";
import RepoDashboard from "@/components/repository/RepoDashboard";

export const Route = createFileRoute("/_authed/dashboard")({
  ssr: false,
  head: () => ({ meta: [{ title: "Repository dashboard · GitSync Pro" }] }),
  component: RepoDashboard,
});