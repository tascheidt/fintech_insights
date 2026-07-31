#!/usr/bin/env npx tsx
/**
 * Feedback triage — manual runner and replay harness.
 *
 * Three jobs:
 *   1. Re-run triage on a submission that got stuck (triage_completed_at null).
 *   2. Replay historical submissions against the current engine WITHOUT writing,
 *      to see how a prompt or policy change would have judged them.
 *   3. Triage an ad-hoc submission typed on the command line, for evaluating the
 *      engine against ideas that were never actually submitted.
 *
 * Replay is the one that earns its keep: the engine it replaced auto-declined
 * two genuine Revolut scraper bug reports on 2026-05-25 as duplicates of "#2",
 * and the admin UI offered no way to reopen them. `--replay --dry-run` re-judges
 * that history so a regression of the same shape is visible before it ships.
 *
 * Usage:
 *   # Replay every historical submission, no writes:
 *   npx tsx --env-file=.env.local web/scripts/triage-feedback.ts --replay --dry-run
 *
 *   # Replay just the two Revolut reports:
 *   npx tsx --env-file=.env.local web/scripts/triage-feedback.ts --replay --dry-run --filter=revolut
 *
 *   # Ad-hoc submission (not persisted):
 *   npx tsx --env-file=.env.local web/scripts/triage-feedback.ts \
 *     --type=bug --title="..." --description="..."
 *
 *   # Re-run and PERSIST triage for one stuck row:
 *   npx tsx --env-file=.env.local web/scripts/triage-feedback.ts --id=<uuid> --write
 */

import { readFileSync } from "node:fs";
import { createAdminClient } from "../lib/supabase/admin";
import {
  triageFeedback,
  MAX_DUPLICATE_CANDIDATES,
  TRIAGE_MODEL,
  TRIAGE_PROMPT_VERSION,
  type DuplicateCandidate,
  type TriageSubmission,
} from "../lib/analysis/feedback-triage";
import { runTriageForSubmission } from "../lib/analysis/feedback-triage-runner";
import type { UsageRecord } from "../lib/ai/gemini-meter";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const DRY_RUN = flag("dry-run") || !flag("write");

async function candidatesFor(id: string): Promise<DuplicateCandidate[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("feedback_duplicate_candidates", {
    p_id: id,
    p_limit: MAX_DUPLICATE_CANDIDATES,
  });
  if (error) {
    console.warn(`  ! candidate lookup failed: ${error.message}`);
    return [];
  }
  return (data ?? []) as DuplicateCandidate[];
}

/**
 * Candidates for an ad-hoc submission that isn't in the table. The RPC keys off
 * a stored row, so fall back to the most recent submissions.
 */
async function recentCandidates(): Promise<DuplicateCandidate[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("feedback_submissions")
    .select("id, title, triage_decision, status, github_issue_number")
    .order("created_at", { ascending: false })
    .limit(MAX_DUPLICATE_CANDIDATES);
  return (data ?? []) as DuplicateCandidate[];
}

/** Candidate pool drawn from a fixture file rather than the database. */
function fixtureCandidates(path: string): DuplicateCandidate[] {
  const fixture = JSON.parse(readFileSync(path, "utf8")) as {
    submissions: Array<{
      id: string;
      title: string;
      triage_decision: string | null;
      status: string;
    }>;
  };
  return fixture.submissions.slice(0, MAX_DUPLICATE_CANDIDATES).map((c) => ({
    id: c.id,
    title: c.title,
    triage_decision: c.triage_decision,
    status: c.status,
    github_issue_number: null,
  }));
}

let totalUsd = 0;
const onUsage = (r: UsageRecord) => {
  totalUsd += r.estimatedUsd;
};

function report(
  submission: TriageSubmission,
  candidates: DuplicateCandidate[],
  result: Awaited<ReturnType<typeof triageFeedback>>,
  previous?: { decision: string | null; status: string; duplicate_of: string | null }
) {
  const dupTitle = result.duplicate_of
    ? candidates.find((c) => c.id === result.duplicate_of)?.title ?? "(unknown)"
    : null;

  console.log(`\n── ${submission.type.toUpperCase()} · ${submission.title}`);
  if (previous) {
    console.log(
      `   was: ${previous.decision ?? "—"} (status ${previous.status})` +
        (previous.duplicate_of ? ` dup=${previous.duplicate_of}` : "")
    );
  }
  console.log(`   now: ${result.decision} (confidence ${result.confidence}/10)`);
  console.log(`   reasoning: ${result.reasoning}`);
  if (result.mapped_priority) console.log(`   priority:  ${result.mapped_priority}`);
  console.log(
    `   duplicate: ${result.duplicate_of ? `${result.duplicate_of} — ${dupTitle}` : "none"}`
  );
  if (result.policy_notes.length) {
    for (const note of result.policy_notes) console.log(`   policy:    ${note}`);
  }
  console.log(`   issue:     ${result.issue_markdown ? "drafted" : "none"}`);
}

async function main() {
  console.log(
    `Feedback triage · model=${TRIAGE_MODEL} prompt=${TRIAGE_PROMPT_VERSION} ` +
      `mode=${DRY_RUN ? "DRY RUN (no writes)" : "WRITE"}\n`
  );

  // --- Ad-hoc submission -------------------------------------------------
  const adHocTitle = arg("title");
  if (adHocTitle) {
    const submission: TriageSubmission = {
      id: "00000000-0000-4000-8000-000000000000",
      type: arg("type") ?? "feature",
      title: adHocTitle,
      description: arg("description") ?? "",
      page_url: arg("page") ?? null,
    };
    const fixture = arg("fixture");
    const candidates = fixture
      ? fixtureCandidates(fixture)
      : await recentCandidates();
    const result = await triageFeedback(submission, candidates, { onUsage });
    report(submission, candidates, result);
    console.log(`\nEstimated spend: $${totalUsd.toFixed(4)}`);
    return;
  }

  // --- Persist a single row ----------------------------------------------
  const id = arg("id");
  if (id && !DRY_RUN) {
    const outcome = await runTriageForSubmission(id, { onUsage });
    console.log(
      `Persisted ${outcome.submissionId}: ${outcome.result.decision} -> status=${outcome.status}`
    );
    console.log(`\nEstimated spend: $${totalUsd.toFixed(4)}`);
    return;
  }

  // --- Replay from a fixture (no Supabase credentials needed) -------------
  // The fixture carries the historical submissions plus the candidate pool, so
  // the engine can be replayed anywhere — CI, a laptop, a review environment —
  // with only GEMINI_API_KEY. Generated by scripts/dump-feedback-fixture.ts.
  const fixturePath = arg("fixture");
  if (fixturePath) {
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      submissions: Array<
        TriageSubmission & {
          status: string;
          triage_decision: string | null;
          triage_duplicate_of: string | null;
        }
      >;
    };

    const filterText = arg("filter")?.toLowerCase();
    const rows = fixture.submissions.filter(
      (r) =>
        !filterText ||
        r.title.toLowerCase().includes(filterText) ||
        r.description.toLowerCase().includes(filterText)
    );

    console.log(`Replaying ${rows.length} fixture submission(s)…`);
    const fixtureFlips: string[] = [];

    for (const row of rows) {
      // Candidates = every other submission in the fixture, mirroring what the
      // trigram RPC would shortlist at this row's point in history.
      const candidates: DuplicateCandidate[] = fixture.submissions
        .filter((c) => c.id !== row.id)
        .slice(0, MAX_DUPLICATE_CANDIDATES)
        .map((c) => ({
          id: c.id,
          title: c.title,
          triage_decision: c.triage_decision,
          status: c.status,
          github_issue_number: null,
        }));

      try {
        const result = await triageFeedback(row, candidates, { onUsage });
        report(row, candidates, result, {
          decision: row.triage_decision,
          status: row.status,
          duplicate_of: row.triage_duplicate_of,
        });
        if (row.triage_decision && row.triage_decision !== result.decision) {
          fixtureFlips.push(
            `${row.triage_decision} → ${result.decision}   ${row.title.slice(0, 70)}`
          );
        }
      } catch (err) {
        console.log(
          `\n── ${row.title}\n   FAILED: ${err instanceof Error ? err.message : err}`
        );
      }
    }

    if (fixtureFlips.length) {
      console.log(`\n\nVerdict changes vs. what is stored (${fixtureFlips.length}):`);
      for (const f of fixtureFlips) console.log(`  ${f}`);
    } else {
      console.log("\n\nNo verdict changes vs. what is stored.");
    }
    console.log(`\nEstimated spend: $${totalUsd.toFixed(4)}`);
    return;
  }

  // --- Replay from the database ------------------------------------------
  const supabase = createAdminClient();
  let query = supabase
    .from("feedback_submissions")
    .select(
      "id, type, title, description, page_url, status, triage_decision, triage_duplicate_of"
    )
    .order("created_at", { ascending: false });

  if (id) query = query.eq("id", id);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const filter = arg("filter")?.toLowerCase();
  const rows = (data ?? []).filter(
    (r) =>
      !filter ||
      r.title.toLowerCase().includes(filter) ||
      r.description.toLowerCase().includes(filter)
  );

  console.log(`Replaying ${rows.length} submission(s)…`);

  const flips: string[] = [];
  for (const row of rows) {
    const submission: TriageSubmission = {
      id: row.id,
      type: row.type,
      title: row.title,
      description: row.description,
      page_url: row.page_url,
    };
    const candidates = await candidatesFor(row.id);

    try {
      const result = await triageFeedback(submission, candidates, { onUsage });
      report(submission, candidates, result, {
        decision: row.triage_decision,
        status: row.status,
        duplicate_of: row.triage_duplicate_of,
      });
      if (row.triage_decision && row.triage_decision !== result.decision) {
        flips.push(
          `${row.triage_decision} → ${result.decision}   ${row.title.slice(0, 70)}`
        );
      }
    } catch (err) {
      console.log(`\n── ${row.title}\n   FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (flips.length) {
    console.log(`\n\nVerdict changes vs. what is stored (${flips.length}):`);
    for (const f of flips) console.log(`  ${f}`);
  } else {
    console.log("\n\nNo verdict changes vs. what is stored.");
  }
  console.log(`\nEstimated spend: $${totalUsd.toFixed(4)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
