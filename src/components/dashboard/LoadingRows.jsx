import { Skeleton } from "@/components/ui/skeleton";

export default function LoadingRows({ rows = 4 }) {
  return (
    <ul className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <li key={index} className="flex items-center gap-3">
          <Skeleton className="h-7 w-7 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-1/3" />
          </div>
        </li>
      ))}
    </ul>
  );
}