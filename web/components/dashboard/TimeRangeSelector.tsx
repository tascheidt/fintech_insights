"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const RANGES = [
  { label: "2W", value: "2w" },
  { label: "1M", value: "1m" },
  { label: "3M", value: "3m" },
  { label: "6M", value: "6m" },
] as const;

export function TimeRangeSelector({ currentRange }: { currentRange: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (range: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (range === "3m") {
      params.delete("range");
    } else {
      params.set("range", range);
    }
    const query = params.toString();
    router.push(query ? `/?${query}` : "/");
  };

  return (
    <div className="inline-flex items-center rounded-lg border bg-muted p-1 text-muted-foreground">
      {RANGES.map(({ label, value }) => (
        <button
          key={value}
          onClick={() => handleChange(value)}
          className={cn(
            "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all",
            currentRange === value
              ? "bg-background text-foreground shadow-sm"
              : "hover:bg-background/50 hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
