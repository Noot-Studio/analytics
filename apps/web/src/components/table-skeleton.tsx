import { Skeleton } from "@sbox-analytics/ui/components/skeleton";

export const TableSkeleton = ({ rows = 6 }: { rows?: number }) => {
  const rowKeys = Array.from({ length: rows }, (_, index) => `row-${index}`);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <Skeleton className="h-8 w-full" />
      {rowKeys.map((key) => (
        <Skeleton className="h-6 w-full" key={key} />
      ))}
    </div>
  );
};
