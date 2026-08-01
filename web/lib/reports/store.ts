/**
 * Shared-report persistence.
 *
 * All reads/writes go through the service-role admin client. That is
 * deliberate for the public path: `/r/[token]` has no session, and the table
 * carries no `anon` RLS policy on purpose (granting one would make every
 * report enumerable). The token is the capability, so every public lookup here
 * is an exact `share_token` match plus explicit revoked/expired checks.
 *
 * Owner-scoped calls take `ownerId` and filter on it in the query — the admin
 * client bypasses RLS, so the ownership check must be written out, not assumed.
 */

import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import {
  type ReportJobRow,
  type ReportSearchContext,
  type ReportSynthesis,
  type SharedReport,
} from "@/lib/reports/types";

const TABLE = "shared_search_reports";

const SELECT_COLUMNS =
  "id, share_token, title, commentary, author_label, search_context, synthesis, jobs_snapshot, job_count, total_match_count, created_at, expires_at, revoked_at";

interface ReportRow {
  id: string;
  share_token: string;
  title: string;
  commentary: string | null;
  author_label: string | null;
  search_context: unknown;
  synthesis: unknown;
  jobs_snapshot: unknown;
  job_count: number;
  total_match_count: number;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

function rowToReport(row: ReportRow): SharedReport {
  return {
    id: row.id,
    shareToken: row.share_token,
    title: row.title,
    commentary: row.commentary,
    authorLabel: row.author_label,
    searchContext: (row.search_context ?? {}) as ReportSearchContext,
    synthesis: (row.synthesis ?? null) as ReportSynthesis | null,
    jobs: Array.isArray(row.jobs_snapshot)
      ? (row.jobs_snapshot as ReportJobRow[])
      : [],
    jobCount: row.job_count,
    totalMatchCount: row.total_match_count,
    createdAt: row.created_at,
  };
}

export interface CreateReportInput {
  shareToken: string;
  ownerId: string;
  authorLabel: string | null;
  title: string;
  commentary: string | null;
  searchContext: ReportSearchContext;
  synthesis: ReportSynthesis | null;
  jobs: ReportJobRow[];
  totalMatchCount: number;
  model: string | null;
  promptVersion: string | null;
}

export async function createSharedReport(
  input: CreateReportInput
): Promise<SharedReport> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      share_token: input.shareToken,
      created_by: input.ownerId,
      author_label: input.authorLabel,
      title: input.title,
      commentary: input.commentary,
      search_context: input.searchContext,
      synthesis: input.synthesis,
      jobs_snapshot: input.jobs,
      job_count: input.jobs.length,
      total_match_count: input.totalMatchCount,
      model: input.model,
      prompt_version: input.promptVersion,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(`Failed to create shared report: ${error?.message ?? "no row returned"}`);
  }
  return rowToReport(data as ReportRow);
}

/** Public lookup. Returns null when missing, revoked, or expired. */
export async function getSharedReportByToken(
  shareToken: string
): Promise<SharedReport | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .eq("share_token", shareToken)
    .maybeSingle();

  if (error) {
    log.error({ err: error.message }, "[reports] token lookup failed");
    return null;
  }
  if (!data) return null;

  const row = data as ReportRow;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
    return null;
  }
  return rowToReport(row);
}

/** Owner-scoped lookup by id. Returns null when the caller doesn't own it. */
export async function getOwnedReport(
  id: string,
  ownerId: string
): Promise<SharedReport | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_COLUMNS)
    .eq("id", id)
    .eq("created_by", ownerId)
    .maybeSingle();

  if (error) {
    log.error({ err: error.message }, "[reports] owned lookup failed");
    return null;
  }
  return data ? rowToReport(data as ReportRow) : null;
}

/** Owner-scoped edit of the parts the sender controls. */
export async function updateOwnedReport(
  id: string,
  ownerId: string,
  patch: { title?: string; commentary?: string | null }
): Promise<SharedReport | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("created_by", ownerId)
    .select(SELECT_COLUMNS)
    .maybeSingle();

  if (error) {
    log.error({ err: error.message }, "[reports] update failed");
    return null;
  }
  return data ? rowToReport(data as ReportRow) : null;
}

/** Best-effort send bookkeeping. Never fails the caller. */
export async function recordReportSend(
  id: string,
  recipientCount: number
): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from(TABLE)
      .select("email_sent_count")
      .eq("id", id)
      .maybeSingle();
    const current = (data as { email_sent_count: number } | null)?.email_sent_count ?? 0;
    await supabase
      .from(TABLE)
      .update({
        email_sent_count: current + recipientCount,
        last_sent_at: new Date().toISOString(),
      })
      .eq("id", id);
  } catch (err) {
    log.warn({ err }, "[reports] failed to record send");
  }
}

/** Best-effort view counter for the public page. Never fails the render. */
export async function recordReportView(id: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.rpc("increment_shared_report_view", { p_report_id: id });
  } catch (err) {
    log.warn({ err }, "[reports] failed to record view");
  }
}
