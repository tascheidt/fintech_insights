"use client";

/**
 * SearchHelpPopover — a tiny, dependency-free "?" affordance that teaches the
 * Jobs search syntax. Hand-rolled (no Radix) because this is static teaching
 * content that needs no focus-trapping or collision logic — just a click
 * toggle with outside-click / Escape to dismiss.
 *
 * Keep the examples in sync with `buildSearchTsQuery` in
 * `web/lib/dashboard-queries.ts`.
 */

import * as React from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyntaxRow {
  example: string;
  desc: string;
}

const SYNTAX: SyntaxRow[] = [
  { example: "staff engineer", desc: "All words must appear — matches as you type." },
  { example: '"staff engineer"', desc: "Exact phrase: the words must be adjacent, in order." },
  { example: "engineer -contract", desc: "Exclude roles that mention “contract.”" },
];

export function SearchHelpPopover({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-label="Search syntax help"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full text-sand-400 transition-colors hover:text-sand-600",
          open && "text-sand-600"
        )}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Search syntax"
          className="absolute right-0 top-7 z-50 w-[300px] rounded-lg border border-sand-200 bg-white p-3 shadow-lg"
        >
          <p className="mb-2 font-mono text-[10.5px] uppercase tracking-wide text-sand-500">
            Search tips
          </p>
          <ul className="space-y-2">
            {SYNTAX.map((row) => (
              <li key={row.example} className="flex flex-col gap-0.5">
                <code className="w-fit rounded bg-sand-100 px-1.5 py-0.5 font-mono text-[12px] text-sand-700">
                  {row.example}
                </code>
                <span className="text-[12px] leading-snug text-sand-600">
                  {row.desc}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 border-t border-sand-100 pt-2 text-[11.5px] leading-snug text-sand-500">
            Searches the title, location, and full job description across every
            active role.
          </p>
        </div>
      )}
    </div>
  );
}
