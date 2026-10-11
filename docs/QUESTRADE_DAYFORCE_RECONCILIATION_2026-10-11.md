# Questrade Dayforce pagination and stale-listing review

Date: 2026-10-11

This is a read-only incident record and reconciliation plan. No production rows were changed.

## Source evidence

- At 12:38 UTC, the public Questrade Dayforce board rendered three pages at
  `https://jobs.dayforcehcm.com/en-US/qfg/CANDIDATEPORTAL`, `?page=2`, and
  `?page=3`.
- The pages contained 25, 25, and 20 unique numeric job IDs respectively: 70
  live listings in total.
- The production run at
  `https://github.com/tascheidt/fintech_insights/actions/runs/38119533829/job/114411213726`
  refreshed 25 of 141 active Questrade records. The mass-closure safeguard
  prevented all 116 unseen records from being closed.
- A read-only Supabase comparison found that all 70 live IDs were already
  active in `job_postings`. Therefore the one-page scraper missed refreshing
  45 live rows, while 71 active stored rows were absent from the live board.

The defect was in `scrapeDayforceWithBrowser`: it extracted links from the
first rendered listing page and then started detail enrichment without reading
Dayforce's pagination.

## Read-only stale-listing review

The 71 absent records are candidates for reconciliation, not an approved
closure set.

- Job `17776`, **Product Manager, Residential Lending**, was individually
  checked. Its Dayforce detail page explicitly says the opportunity is no
  longer available. Its stored `last_seen_date` was 2026-09-30. This is strong
  evidence for closure, but this PR does not change the row.
- The other 70 absent records have not been individually verified. Their
  absence from one board snapshot is not sufficient evidence to close them.

## Reviewable reconciliation plan

1. Merge and deploy the pagination fix only after CI and review. Do not couple
   code deployment to a manual database update.
2. Run a read-only source collection and retain its page summaries and 70
   unique IDs. Confirm the board still reports the same page count throughout
   the run and every non-final page contains 25 unique jobs.
3. Compare that complete set to active Questrade rows and export the candidate
   closure set with `external_id`, title, URL, and `last_seen_date` for human
   review.
4. Verify every candidate detail URL. Classify it as explicitly unavailable,
   still live/redirected, or inconclusive. Treat timeouts, challenge pages,
   selector drift, and generic errors as inconclusive.
5. Apply no manual bulk closure. Let the normal ingestion path propose closures
   only from a complete validated collection, with the existing mass-closure
   safeguard still active. If the 71/141 proposal still trips the safeguard,
   review and authorize any exceptional reconciliation separately with the
   candidate evidence attached.
6. After any authorized reconciliation, verify that all 70 live IDs remain
   active and that only individually supported stale rows changed state.

## Limits

- Only the public Questrade tenant (`qfg`) was live-checked. Repository search
  found no other configured Dayforce tenant; the implementation remains
  tenant-generic and validates Dayforce's shared pagination contract.
- The local read-only smoke confirmed 70 unique listing links across three
  pages. Full 70-detail enrichment was stopped after listing validation because
  the pagination change does not alter detail extraction.
- The unrelated CIBC Saturday Reader failure and Revolut PR #148 were not
  investigated or changed.
