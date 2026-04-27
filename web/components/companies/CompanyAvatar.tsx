/**
 * CompanyAvatar — letter-initial avatar with a deterministic brand color.
 *
 * Canonical contract from `ui_kits/talent_brief/CompanyMatrix.jsx`:
 *   <span className="tb-table__avatar" style={{background: r.color}}>{r.initial}</span>
 *
 * The color is derived from the company name so the same company always
 * gets the same color across surfaces (job rows, matrix, list, sidebar).
 * No need to store a brand color in the DB.
 *
 * Used by:
 * - Companies list page
 * - Jobs table (JobHistoryView)
 * - Hot Roles feed
 * - Competitive Matrix
 */

import { cn } from "@/lib/utils";

const PALETTE = [
  "bg-pacific-500",
  "bg-pacific-700",
  "bg-sunset-500",
  "bg-sun-700",
  "bg-sand-700",
  "bg-pacific-600",
] as const;

export function getCompanyColor(name: string): (typeof PALETTE)[number] {
  if (!name) return PALETTE[0];
  const hash = (name.charCodeAt(0) + name.charCodeAt(name.length - 1)) % PALETTE.length;
  return PALETTE[hash];
}

export function CompanyAvatar({
  name,
  size = 28,
  className,
}: {
  name: string | undefined;
  size?: number;
  className?: string;
}) {
  if (!name) return null;
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md font-semibold text-white",
        getCompanyColor(name),
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.46 }}
    >
      {initial}
    </span>
  );
}
