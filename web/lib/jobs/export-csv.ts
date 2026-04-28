/**
 * Client-side CSV export for the Jobs list.
 *
 * Operates on the same `JobsListRow` shape the page renders. We ship CSV
 * (not XLSX) because every analyst can open it in Excel / Sheets / Numbers
 * with no plugins; XLSX would require a heavy dep for one feature.
 *
 * Headers are stable (renaming a column would break analyst pipelines) so
 * change them only when intentionally bumping a downstream contract.
 */

import type { JobsListRow } from "@/lib/dashboard-queries";

const HEADERS = [
  "Title",
  "Company",
  "Function group",
  "Function category",
  "Location",
  "Posted (UTC date)",
  "Age (days)",
  "Active",
  "Keywords",
  "Job ID",
] as const;

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = typeof value === "string" ? value : String(value);
  // Per RFC 4180: any cell containing a comma, quote, CR, or LF must be
  // quoted, and embedded quotes must be doubled. We also strip stray CRs
  // because Excel chokes when CR ends up inside a quoted cell on Windows.
  str = str.replace(/\r/g, " ");
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function jobsRowsToCsv(rows: JobsListRow[]): string {
  const lines = [HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.title,
        r.companyName,
        r.functionGroup ?? "",
        r.functionCategory ?? "",
        r.location ?? "",
        r.firstSeenDate ?? "",
        r.ageDays ?? "",
        r.isActive ? "yes" : "no",
        (r.keywords ?? []).join(" | "),
        r.id,
      ]
        .map(escapeCell)
        .join(",")
    );
  }
  return lines.join("\n");
}

/**
 * Trigger a browser download of the rows as a CSV file. Caller passes
 * `filenameStem` without the `.csv` extension.
 */
export function downloadJobsCsv(
  rows: JobsListRow[],
  filenameStem = "jobs"
): void {
  if (typeof window === "undefined") return;
  const csv = jobsRowsToCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${filenameStem}-${date}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
