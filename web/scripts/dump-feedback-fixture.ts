#!/usr/bin/env npx tsx
/**
 * Dump `feedback_submissions` to a replay fixture.
 *
 * The fixture lets `triage-feedback.ts --replay --fixture=<path>` re-judge real
 * historical submissions with only GEMINI_API_KEY — no Supabase credentials, so
 * it runs in CI or a review environment. Deliberately omits user_id, emails and
 * every admin/GitHub column: the fixture exists to exercise the classifier, and
 * the classifier only ever sees type/title/description/page_url.
 *
 * Usage:
 *   npx tsx --env-file=.env.local web/scripts/dump-feedback-fixture.ts \
 *     > web/scripts/fixtures/feedback-history.json
 */

import { createAdminClient } from "../lib/supabase/admin";

async function main() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("feedback_submissions")
    .select(
      "id, type, title, description, page_url, status, triage_decision, triage_confidence, triage_duplicate_of, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  process.stdout.write(
    JSON.stringify(
      {
        note:
          "Replay fixture for web/scripts/triage-feedback.ts. Historical verdicts are the OLD engine's output, kept so a replay can show what changed. No user identifiers.",
        submissions: data ?? [],
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
