/**
 * Public shared report — `/r/[token]`.
 *
 * Readable with no account. The token is the capability: the lookup is an
 * exact `share_token` match through the service-role client (the table carries
 * no `anon` RLS policy — see the migration header), and everything rendered
 * comes from the report's own snapshot. This page never queries `job_postings`
 * or `companies`, so there is no live read path an anonymous visitor can reach.
 *
 * The gate: the report itself is fully readable, but every way *deeper* — the
 * job detail page, the company page, running the search yourself — goes
 * through `/login`, which preserves the destination via `?next=`. That is the
 * intended funnel: the artifact is the free sample, the product is behind
 * sign-in.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { ArrowRight, Lock } from "lucide-react";
import { FunctionDot } from "@/components/design";
import { getSharedReportByToken, recordReportView } from "@/lib/reports/store";
import { isValidShareTokenShape } from "@/lib/reports/share-token";
import {
  describeSearchContext,
  formatReportDate,
  type SharedReport,
} from "@/lib/reports/types";

/**
 * A share link is a capability URL — `noindex` on every variant so a report
 * that gets forwarded, pasted into a public channel, or crawled off someone's
 * inbox never becomes a search result.
 */
const BASE_METADATA: Metadata = {
  robots: { index: false, follow: false },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  if (!isValidShareTokenShape(token)) return BASE_METADATA;
  const report = await getSharedReportByToken(token);
  if (!report) return BASE_METADATA;

  return {
    ...BASE_METADATA,
    title: `${report.title} · The Fintech Talent Brief`,
    description:
      report.synthesis?.headline ??
      `${report.jobCount} fintech roles — ${describeSearchContext(report.searchContext)}`,
  };
}

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isValidShareTokenShape(token)) notFound();

  const report = await getSharedReportByToken(token);
  if (!report) notFound();

  // Runs after the response is streamed — `after` keeps the counter off the
  // render's critical path without leaving a floating promise the serverless
  // runtime might drop. Failures are swallowed inside `recordReportView`.
  after(() => recordReportView(report.id));

  return (
    <div className="mx-auto w-full max-w-[880px] px-5 py-8 sm:px-8 sm:py-12">
      <TopBar />
      <ReportHeader report={report} />
      {report.commentary && <CommentaryBlock report={report} />}
      {report.synthesis && <SynthesisBlock synthesis={report.synthesis} />}
      <JobsTable report={report} />
      <SignInGate />
      <Footer />
    </div>
  );
}

function TopBar() {
  return (
    <div className="mb-8 flex items-center justify-between border-b border-sand-200 pb-4">
      <span className="text-[12px] font-semibold uppercase tracking-[0.09em] text-sand-600">
        The Fintech Talent Brief
      </span>
      <Link
        href="/login"
        className="text-[12.5px] font-medium text-pacific-600 transition-colors hover:text-pacific-700"
      >
        Sign in
      </Link>
    </div>
  );
}

function ReportHeader({ report }: { report: SharedReport }) {
  return (
    <header className="mb-7">
      <h1
        className="mb-2 text-[30px] leading-[1.15] text-sand-950 sm:text-[34px]"
        style={{ letterSpacing: "-0.02em", fontWeight: 600 }}
      >
        {report.title}
      </h1>
      <p className="text-[13px] text-sand-600">
        {report.authorLabel ? `Shared by ${report.authorLabel} · ` : ""}
        {formatReportDate(report.createdAt)}
      </p>
      <p className="mt-1.5 text-[13px] text-sand-500">
        {describeSearchContext(report.searchContext)}
      </p>
    </header>
  );
}

function CommentaryBlock({ report }: { report: SharedReport }) {
  return (
    <section className="mb-7 rounded-xl border border-pacific-200 bg-pacific-50 px-5 py-4">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.07em] text-pacific-700">
        {report.authorLabel ? `Note from ${report.authorLabel}` : "Note"}
      </p>
      <p className="whitespace-pre-wrap text-[14.5px] leading-[1.6] text-sand-900">
        {report.commentary}
      </p>
    </section>
  );
}

function SynthesisBlock({
  synthesis,
}: {
  synthesis: NonNullable<SharedReport["synthesis"]>;
}) {
  return (
    <section className="mb-8 rounded-xl border border-sand-200 bg-white px-5 py-6 sm:px-7">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.07em] text-sand-500">
        What this set contains
      </p>
      <h2
        className="mb-3 text-[21px] leading-[1.28] text-sand-950"
        style={{ letterSpacing: "-0.015em", fontWeight: 600 }}
      >
        {synthesis.headline}
      </h2>
      <p className="max-w-[70ch] text-[14.5px] leading-[1.68] text-sand-700">
        {synthesis.summary}
      </p>

      {synthesis.roleGroups.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {synthesis.roleGroups.map((group) => (
            <div
              key={group.label}
              className="rounded-lg border border-sand-100 bg-sand-25 px-4 py-3"
            >
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="text-[13.5px] font-semibold text-sand-900">
                  {group.label}
                </span>
                <span className="shrink-0 font-mono text-[12px] text-sand-500">
                  {group.count}
                </span>
              </div>
              <p className="text-[12.5px] leading-[1.5] text-sand-600">
                {group.detail}
              </p>
            </div>
          ))}
        </div>
      )}

      {synthesis.commonRequirements.length > 0 && (
        <div className="mt-5 border-t border-sand-100 pt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-sand-500">
            Recurring requirements
          </p>
          <div className="flex flex-wrap gap-1.5">
            {synthesis.commonRequirements.map((requirement) => (
              <span
                key={requirement}
                className="rounded-md border border-sand-200 bg-white px-2 py-1 text-[12px] text-sand-700"
              >
                {requirement}
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="mt-5 text-[11.5px] text-sand-400">
        Summary generated from the postings below.
      </p>
    </section>
  );
}

function JobsTable({ report }: { report: SharedReport }) {
  const truncated = report.totalMatchCount > report.jobCount;

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-sand-900">
          {report.jobCount} {report.jobCount === 1 ? "role" : "roles"}
        </h2>
        {truncated && (
          <p className="text-[12px] text-sand-500">
            Showing {report.jobCount} of {report.totalMatchCount} matches
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-sand-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-sand-200 bg-sand-25">
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-sand-500">
                  Role
                </th>
                <th className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-sand-500">
                  Company
                </th>
                <th className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-sand-500 sm:table-cell">
                  Function
                </th>
                <th className="hidden px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-sand-500 md:table-cell">
                  Location
                </th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-sand-500">
                  Posted
                </th>
              </tr>
            </thead>
            <tbody>
              {report.jobs.map((job) => (
                <tr
                  key={job.id}
                  className="border-b border-sand-100 last:border-b-0"
                >
                  <td className="px-4 py-3 align-top">
                    {/* Deep links are the gate: an anonymous click lands on
                        /login?next=/jobs/[id] and returns here after sign-in. */}
                    <Link
                      href={`/jobs/${job.id}`}
                      className="text-[13.5px] font-medium leading-[1.4] text-sand-900 underline decoration-sand-300 underline-offset-2 transition-colors hover:text-pacific-600"
                    >
                      {job.title}
                    </Link>
                    {!job.isActive && (
                      <span className="ml-2 rounded border border-sand-200 px-1.5 py-0.5 text-[10.5px] text-sand-500">
                        closed
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-[13px] text-sand-700">
                    {job.companyName}
                  </td>
                  <td className="hidden px-4 py-3 align-top text-[13px] text-sand-700 sm:table-cell">
                    {job.functionGroup ? (
                      <span className="inline-flex items-center gap-1.5">
                        <FunctionDot fn={job.functionGroup} />
                        {job.functionGroup}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="hidden px-4 py-3 align-top text-[13px] text-sand-600 md:table-cell">
                    {job.location ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right align-top font-mono text-[12px] text-sand-500">
                    {formatReportDate(job.firstSeenDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function SignInGate() {
  return (
    <section className="mb-10 rounded-xl border border-sand-200 bg-white px-5 py-6 sm:px-7">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-4 w-4 shrink-0 text-sand-400" aria-hidden />
        <div>
          <h2 className="mb-1.5 text-[15px] font-semibold text-sand-900">
            Go deeper
          </h2>
          <p className="mb-4 max-w-[62ch] text-[13.5px] leading-[1.6] text-sand-600">
            This report is a snapshot. Signing in opens the full posting for
            every role, the hiring history behind each company, and the search
            that produced this list — so you can re-run it with your own
            filters.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 rounded-lg bg-pacific-500 px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-pacific-600"
          >
            Sign in to explore
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-sand-200 pt-5 text-[12px] text-sand-500">
      <p>
        The Fintech Talent Brief — hiring intelligence for fintech. Shared
        reports are point-in-time snapshots and are not updated after they are
        sent.
      </p>
    </footer>
  );
}
