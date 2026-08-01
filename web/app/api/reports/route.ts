/**
 * POST /api/reports — generate a shareable report from a Jobs search.
 *
 * The client sends the ids of the rows currently in view plus the search
 * context that produced them. The server does NOT trust the client's row
 * data: it re-reads every id from `active_job_postings` and builds the
 * snapshot itself. That matters more than usual here, because the snapshot is
 * rendered on a page anyone with the link can read — a client-supplied row
 * would be an unauthenticated-publishing primitive.
 *
 * Two further scoping rules are enforced server-side for the same reason:
 *   - the read goes through `active_job_postings`, so a deactivated company
 *     cannot be published (CLAUDE.md §7);
 *   - incumbent-tier rows are dropped when `incumbent_tracking_enabled` is off,
 *     matching what the Jobs page itself would have shown.
 *
 * One Gemini call (Flash, ungrounded) per report. A synthesis failure is
 * non-fatal — the report is still created, table-only.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIncumbentTrackingEnabled } from "@/lib/settings/incumbent-tracking";
import {
  CATEGORY_GROUPS,
  ROLE_CATEGORIES,
  getCategoryGroup,
  type RoleCategory,
} from "@/lib/analysis/function-categories";
import {
  generateSearchReportSynthesis,
  loadSynthesisInputs,
  SEARCH_REPORT_MODEL,
  SEARCH_REPORT_PROMPT_VERSION,
} from "@/lib/analysis/search-report";
import { createSharedReport } from "@/lib/reports/store";
import { generateShareToken } from "@/lib/reports/share-token";
import {
  MAX_REPORT_JOBS,
  buildReportTitle,
  buildReportUrl,
  type ReportJobRow,
  type ReportSearchContext,
} from "@/lib/reports/types";
import { getEmailBaseUrl } from "@/lib/email/links";
import { log } from "@/lib/log";

const SearchContextSchema = z.object({
  query: z.string().max(300).nullable().default(null),
  mode: z.enum(["keyword", "semantic"]).default("keyword"),
  company: z.string().max(200).nullable().default(null),
  functionGroup: z.string().max(120).nullable().default(null),
  recency: z.enum(["any", "7", "30"]).default("any"),
  tier: z.enum(["fintech", "incumbent", "all"]).default("fintech"),
  status: z.enum(["active", "inactive", "all"]).default("active"),
});

const RequestSchema = z.object({
  jobIds: z.array(z.string().uuid()).min(1).max(MAX_REPORT_JOBS),
  /** Rows the search matched before the client capped the list at MAX_REPORT_JOBS. */
  totalMatchCount: z.number().int().min(0).max(100_000).optional(),
  searchContext: SearchContextSchema,
  title: z.string().min(1).max(160).optional(),
  commentary: z.string().max(2000).optional(),
});

interface RawRow {
  id: string;
  title: string;
  function_category: string | null;
  location: string | null;
  first_seen_date: string | null;
  is_active: boolean;
  companies:
    | { name: string; slug: string; tier: string }
    | { name: string; slug: string; tier: string }[]
    | null;
}

function mapSnapshotRow(row: RawRow, now: number): ReportJobRow {
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
  const ageDays = row.first_seen_date
    ? Math.max(
        0,
        Math.floor((now - new Date(row.first_seen_date).getTime()) / 86_400_000)
      )
    : null;
  const functionGroup =
    row.function_category &&
    (ROLE_CATEGORIES as readonly string[]).includes(row.function_category)
      ? getCategoryGroup(row.function_category as RoleCategory)
      : null;

  return {
    id: row.id,
    title: row.title,
    companyName: company?.name ?? "—",
    companySlug: company?.slug ?? "",
    functionGroup,
    location: row.location,
    firstSeenDate: row.first_seen_date,
    ageDays,
    isActive: row.is_active,
  };
}

/** Display name for the report byline. Falls back to the email local part. */
function resolveAuthorLabel(user: {
  email?: string;
  user_metadata?: Record<string, unknown>;
}): string | null {
  const meta = user.user_metadata ?? {};
  const name =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    null;
  if (name) return name;
  if (user.email) return user.email.split("@")[0];
  return null;
}

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { jobIds, searchContext, title, commentary } = parsed.data;

  // Normalize the function-group label — it lands in a public artifact, so it
  // must be one of ours rather than arbitrary client text.
  const normalizedContext: ReportSearchContext = {
    ...searchContext,
    query: searchContext.query?.trim() || null,
    functionGroup:
      searchContext.functionGroup &&
      Object.keys(CATEGORY_GROUPS).includes(searchContext.functionGroup)
        ? searchContext.functionGroup
        : null,
  };

  const incumbentEnabled = await getIncumbentTrackingEnabled();
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("active_job_postings")
    .select(
      "id, title, function_category, location, first_seen_date, is_active, companies!inner(name, slug, tier)"
    )
    .in("id", jobIds);

  if (error) {
    log.error({ err: error.message }, "[reports] failed to load job rows");
    return NextResponse.json(
      { error: "Failed to load jobs for this report" },
      { status: 500 }
    );
  }

  const now = Date.now();
  const byId = new Map<string, ReportJobRow>();
  for (const raw of (data ?? []) as RawRow[]) {
    const company = Array.isArray(raw.companies) ? raw.companies[0] : raw.companies;
    if (!incumbentEnabled && company?.tier === "incumbent") continue;
    byId.set(raw.id, mapSnapshotRow(raw, now));
  }

  // Preserve the client's ordering (semantic relevance, or the user's chosen
  // sort) — the report should read in the order the sender saw.
  const jobs = jobIds
    .map((id) => byId.get(id))
    .filter((row): row is ReportJobRow => row !== undefined);

  if (jobs.length === 0) {
    return NextResponse.json(
      { error: "No shareable roles in this result set" },
      { status: 400 }
    );
  }

  const totalMatchCount = Math.max(
    parsed.data.totalMatchCount ?? jobs.length,
    jobs.length
  );

  // Synthesis is best-effort: a failure yields a table-only report rather than
  // a failed request. `loadSynthesisInputs` reads the description bodies the
  // snapshot deliberately doesn't carry.
  let synthesis = null;
  try {
    const inputs = await loadSynthesisInputs(jobs);
    synthesis = await generateSearchReportSynthesis({
      jobs: inputs,
      searchContext: normalizedContext,
      totalCount: jobs.length,
    });
  } catch (err) {
    log.error({ err }, "[reports] synthesis step threw; continuing table-only");
  }

  try {
    const report = await createSharedReport({
      shareToken: generateShareToken(),
      ownerId: user.id,
      authorLabel: resolveAuthorLabel(user),
      title: title?.trim() || buildReportTitle(normalizedContext, jobs.length),
      commentary: commentary?.trim() || null,
      searchContext: normalizedContext,
      synthesis,
      jobs,
      totalMatchCount,
      model: synthesis ? SEARCH_REPORT_MODEL : null,
      promptVersion: synthesis ? SEARCH_REPORT_PROMPT_VERSION : null,
    });

    return NextResponse.json({
      report,
      url: buildReportUrl(report.shareToken, getEmailBaseUrl()),
    });
  } catch (err) {
    log.error({ err }, "[reports] failed to persist report");
    return NextResponse.json(
      { error: "Failed to save the report" },
      { status: 500 }
    );
  }
}
