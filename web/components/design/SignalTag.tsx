/**
 * SignalTag — small mono lowercase chip used inline in job titles to
 * surface signals like "payments rails", "Go", "bilingual".
 *
 * Reference: the small inline chips inside job rows in
 * /tmp/design-package-v2/.../JobsList_v2.jsx
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SignalTagProps {
  children: ReactNode;
  className?: string;
}

export function SignalTag({ children, className }: SignalTagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[4px] bg-muted text-muted-foreground font-mono lowercase",
        className
      )}
      style={{ fontSize: 9.5, padding: "3px 6px", lineHeight: 1 }}
    >
      {children}
    </span>
  );
}
