/**
 * Jobs Page (v2 — list-first browsing surface).
 *
 * Editorial header + filter bar + two-column grid (sortable list | right
 * rail with function heat and cross-company themes).
 *
 * Accepts query parameters so deep links from the weekly digest email
 * land users in a pre-filtered view with a context banner. Supported
 * params:
 *   - status, time, date (legacy — deprecated; recency overrides them now)
 *   - q, company, function, recency (new v2 params owned by JobsHeader)
 *   - theme       (role theme id; filters via classifyJob)
 *   - inDigest    (weekly_digests UUID — scopes to that digest's job_ids)
 *   - from, to    (ISO date strings; bound first_seen_date)
 *   - tier        (fintech | incumbent | all — scopes which company tiers
 *                  the list shows; default/absent = fintech-only)
 *
 * Note: the company-scoped Jobs tab inside companies/[slug] still uses
 * `JobHistoryView` — do NOT remove that component.
 */

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  getJobsListData,
  getFunctionHeatData,
  getCrossCompanyThemes,
  type JobsListRow,
  type CompanyTier,
} from "@/lib/dashboard-queries";
import { CATEGORY_GROUPS } from "@/lib/analysis/function-categories";
import { JobsPageClient } from "@/components/jobs/JobsPageClient";

type JobsPageSearchParams = {
  // Legacy
  status?: string;
  time?: string;
  date?: string;
  // Digest deep-link
  theme?: string;
  inDigest?: string;
  from?: string;
  to?: string;
  // v2 owned by JobsHeader
  q?: string;
  company?: string;
  function?: string;
  recency?: string;
  tier?: string;
  mode?: string; // "semantic" | "keyword" (default)
};

/**
 * Resolve the `?tier=` param to the company tiers the Jobs list should show.
 * Default / absent / unrecognized → fintech-only (the Jobs page is a fintech
 * surface by default). `incumbent` → banks only; `all` → both tiers.
 */
function parseTierParam(value: string | undefined): readonly CompanyTier[] {
  if (value === "incumbent") return ["incumbent"];
  if (value === "all") return ["fintech", "incumbent"];
  return ["fintech"];
}

/** Normalize the `?tier=` param for the JobsHeader filter control. */
function parseTierFilter(
  value: string | undefined
): "fintech" | "incumbent" | "all" {
  if (value === "incumbent") return "incumbent";
  if (value === "all") return "all";
  return "fintech";
}

/**
 * Resolve the `?status=` param to the activity scope. Default / absent /
 * unrecognized → `active` (the Jobs board shows only live roles unless the
 * user opts into closed ones). Drives a server re-query, like the tier toggle.
 */
function parseStatusScope(
  value: string | undefined
): "active" | "inactive" | "all" {
  if (value === "inactive") return "inactive";
  if (value === "all") return "all";
  return "active";
}

type DigestCompanyRow = {
  company_id: string;
  job_ids: unknown;
};

function parseIsoDateParam(value?: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return value;
}

/** Coerce the inbound `recency` param to a known value. */
function parseRecency(
  value: string | undefined,
  legacyTime?: string,
  legacyDate?: string
): "any" | "7" | "30" {
  if (value === "7" || value === "30") return value;
  if (value === "any") return "any";
  // Legacy fallback: time=7days / date=week → recency=7.
  if (legacyTime === "7days" || legacyDate === "week") return "7";
  if (legacyTime === "30days") return "30";
  return "any";
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<JobsPageSearchParams>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const themeParam = params.theme?.trim() || null;
  const companyParam = params.company?.trim() || null;
  const inDigestParam = params.inDigest?.trim() || null;
  const fromParam = parseIsoDateParam(params.from);
  const toParam = parseIsoDateParam(params.to);
  const tiers = parseTierParam(params.tier);
  const tierFilter = parseTierFilter(params.tier);
  // A digest deep-link is a historical snapshot — many of its roles have since
  // closed, so it forces `all` to keep the snapshot whole regardless of the
  // active-only default.
  const statusFilter = params.inDigest?.trim()
    ? "all"
    : parseStatusScope(params.status);

  // Resolve digest snapshot scope — when inDigest is set, the relevant
  // job IDs are pulled from weekly_digest_companies.job_ids and act as
  // an exclusive filter regardless of recency / status.
  let digestJobIds: string[] | null = null;
  if (inDigestParam) {
    let companyId: string | null = null;
    if (companyParam) {
      const { data: companyRow } = await supabase
        .from("companies")
        .select("id")
        .eq("slug", companyParam)
        .maybeSingle();
      companyId = companyRow?.id ?? null;
    }

    let digestQuery = supabase
      .from("weekly_digest_companies")
      .select("company_id, job_ids")
      .eq("digest_id", inDigestParam);

    if (companyParam && companyId) {
      digestQuery = digestQuery.eq("company_id", companyId);
    }

    const { data: digestCompanyRows } = await digestQuery;
    const ids = new Set<string>();
    for (const row of (digestCompanyRows ?? []) as DigestCompanyRow[]) {
      const raw = Array.isArray(row.job_ids) ? row.job_ids : [];
      for (const id of raw) {
        if (typeof id === "string" && id) ids.add(id);
      }
    }
    digestJobIds = Array.from(ids);
  }

  const initialQ = (params.q ?? "").trim();
  const searchMode = params.mode === "semantic" ? "semantic" : "keyword";
  // Relevance order only applies when a semantic search actually ran (query
  // present + semantic mode); the table preserves the server's ranking then.
  const relevanceOrder = searchMode === "semantic" && initialQ.length > 0;

  // The jobs list honors the `?tier=` toggle. The right rail (function heat /
  // cross-company themes) deliberately stays fintech-only regardless of the
  // toggle — those are fintech-pivot surfaces, not tier-scoped.
  const [jobsResult, heat, themes] = await Promise.all([
    getJobsListData({
      jobIds: digestJobIds,
      tiers,
      searchQuery: initialQ || null,
      searchMode,
      status: statusFilter,
    }),
    getFunctionHeatData(30),
    getCrossCompanyThemes(),
  ]);
  const { rows, truncated } = jobsResult;

  // Apply server-side date bounds (digest deep-link only). The interactive
  // "recency" filter lives on the client and overlays this baseline.
  const fromCutoff = fromParam ? new Date(fromParam) : null;
  const toCutoff = toParam ? new Date(toParam) : null;
  const baseRows: JobsListRow[] =
    fromCutoff || toCutoff
      ? rows.filter((r) => {
          if (!r.firstSeenDate) return false;
          const seen = new Date(r.firstSeenDate);
          if (fromCutoff && seen < fromCutoff) return false;
          if (toCutoff && seen > toCutoff) return false;
          return true;
        })
      : rows;

  // Eyebrow stats are derived from the visible (post-digest-scope) baseline
  // so they stay accurate when the user enters from a digest deep link.
  const activeCount = baseRows.filter((r) => r.isActive).length;
  const newCount = baseRows.filter(
    (r) => r.ageDays !== null && r.ageDays <= 7
  ).length;

  // Available companies for dropdown — distinct slugs from active visible rows.
  const companyMap = new Map<string, { slug: string; name: string }>();
  for (const r of baseRows) {
    if (r.companySlug && r.companyName) {
      companyMap.set(r.companySlug, {
        slug: r.companySlug,
        name: r.companyName,
      });
    }
  }
  const companies = Array.from(companyMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  // Function groups for dropdown — full taxonomy keeps the option set
  // stable across filter swings.
  const functionGroups = Object.keys(CATEGORY_GROUPS).sort();

  // Resolve display name of the company filter (for the digest banner).
  const digestCompanyName = companyParam
    ? companyMap.get(companyParam)?.name ?? null
    : null;

  // Initial filter state seeded from URL.
  const initialCompany = companyParam && companyMap.has(companyParam) ? companyParam : "all";
  const initialFn =
    params.function && Object.keys(CATEGORY_GROUPS).includes(params.function)
      ? params.function
      : "all";
  const initialRecency = parseRecency(params.recency, params.time, params.date);

  // Total companies covered (for the sub-headline copy).
  const { count: companyCount } = await supabase
    .from("companies")
    .select("*", { count: "exact", head: true })
    .eq("is_active", true);

  return (
    <JobsPageClient
      rows={baseRows}
      heat={heat}
      themes={themes}
      companies={companies}
      functionGroups={functionGroups}
      initial={{
        q: initialQ,
        company: initialCompany,
        fn: initialFn,
        recency: initialRecency,
        mode: searchMode,
      }}
      digestContext={{
        themeId: themeParam,
        inDigest: inDigestParam,
        fromDate: fromParam,
        toDate: toParam,
        companyName: digestCompanyName,
      }}
      activeCount={activeCount}
      newCount={newCount}
      companyCount={companyCount ?? companies.length}
      tierFilter={tierFilter}
      statusFilter={statusFilter}
      searchTruncated={truncated}
      relevanceOrder={relevanceOrder}
    />
  );
}
