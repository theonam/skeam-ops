// Origine : egm-app `src/components/ui/skeleton.tsx`.
import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-slate-200", className)} />;
}

/** Squelette d'une liste, affiché pendant le chargement des données. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4 tablet:p-6" role="status" aria-label="Chargement">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** Squelette d'une fiche, affiché pendant la lecture. */
export function FormSkeleton() {
  return (
    <div className="space-y-4 p-4 tablet:p-6" role="status" aria-label="Chargement">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
