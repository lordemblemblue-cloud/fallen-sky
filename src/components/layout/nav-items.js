import { CircleDot, FolderGit2, GitPullRequest, LayoutDashboard } from "lucide-react";

export const NAV_ITEMS = [
  { to: "/", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/repositories", label: "Repositories", icon: FolderGit2 },
  { to: "/pull-requests", label: "Pull requests", icon: GitPullRequest },
  { to: "/issues", label: "Issues", icon: CircleDot },
];