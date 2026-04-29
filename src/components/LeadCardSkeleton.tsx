interface LeadCardSkeletonProps {
  count?: number;
  compact?: boolean;
}

export function LeadCardSkeleton({ count = 6, compact = true }: LeadCardSkeletonProps) {
  return (
    <div className="grid grid-cols-1 gap-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="lead-card border p-4 animate-fade-in"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {compact ? (
            <div className="flex items-center gap-3">
              <div className="size-4 rounded skeleton-shimmer" />
              <div className="size-9 rounded-xl skeleton-shimmer" />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-3.5 w-2/3 skeleton-shimmer" />
                <div className="h-3 w-1/3 skeleton-shimmer" />
              </div>
              <div className="hidden md:block h-6 w-20 skeleton-shimmer rounded-md" />
              <div className="hidden lg:block h-6 w-32 skeleton-shimmer rounded-md" />
              <div className="size-8 rounded-md skeleton-shimmer" />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-xl skeleton-shimmer" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="h-4 w-1/2 skeleton-shimmer" />
                  <div className="h-3 w-1/4 skeleton-shimmer" />
                </div>
                <div className="h-6 w-14 skeleton-shimmer rounded-md" />
              </div>
              <div className="space-y-2 pt-2">
                <div className="h-3 w-3/4 skeleton-shimmer" />
                <div className="h-3 w-2/3 skeleton-shimmer" />
                <div className="h-3 w-1/2 skeleton-shimmer" />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default LeadCardSkeleton;