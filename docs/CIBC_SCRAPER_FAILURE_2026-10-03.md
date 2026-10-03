# CIBC/Simplii scraper investigation — October 3, 2026

## Verified failures and previous attempts

- [October 3 run 37104515859](https://github.com/tascheidt/fintech_insights/actions/runs/37104515859), main `f2b2bb5296edaa11ba0eb97a17ae344de80f05d4`: completed with failure at 06:57:01 UTC. Both `scrape` (job 111150328220) and `scrape-retry` (111150470549) failed. CIBC listing POST returned HTTP 200 HTML/Akamai challenge; the Reader fallback then threw `CIBC reader search did not render a complete jobs list`.
- [September 26 run 36225091234](https://github.com/tascheidt/fintech_insights/actions/runs/36225091234), main `bb424375b4b42447ad97778c8cd94b338cce46ab`: both jobs failed with the same direct Akamai challenge around 06:54 and 06:56 UTC.
- [PR #143](https://github.com/tascheidt/fintech_insights/pull/143) audited five consecutive Saturday CIBC failures (Aug 1, 8, 15, 22, 29), each failing on both runners, while Sunday recovered. It narrowed CIBC to Simplii candidates and rejected extra immediate runners.
- [PR #145](https://github.com/tascheidt/fintech_insights/pull/145) added the Reader fallback. Its live checks on September 26 returned 15 candidates, all descriptions, six Simplii roles. Later September 26 workflow runs succeeded, including the post-merge run.

These are collection/source failures, not Gemini failures, database write timeouts, or the earlier `/job/job/` detail URL defect. The original October 3 run saved no Reader response artifact, so we cannot establish whether its count, link inventory, or both were missing. Do not claim a captured maintenance notice or an exact historical rendering race.

## Runtime evidence and fix

The unmodified fallback succeeded on October 3 from both the Mac and a GitHub runner: 10 candidates, 10 full descriptions, four Simplii roles. The Mac's direct CXS result set had the exact same 10 external paths. [Hosted diagnostic run 37117292363](https://github.com/tascheidt/fintech_insights/actions/runs/37117292363) preserved public responses as artifacts. This rules out a persistent inability to reach the relay.

The old fallback requested the default article/readability extraction for a structured job inventory. It waited for the first title selector, without requesting explicit rendering completion. It accepted a successful HTTP/envelope response before running the completeness parser outside the retry boundary. Consequently a single incomplete HTTP-200 snapshot bypassed all remaining attempts.

The repair requests full DOM text (`X-Respond-With: text`), requests explicit completion (`X-Timeout: 30`, within the existing 60-second client timeout), and moves semantic validation inside the existing three-attempt Reader budget. It does not increase the attempt count or add runner retries. Count/link equality, canonical CIBC URLs, the 20-result ceiling and full descriptions remain mandatory before ingest. Failures report count, link count, text length and maintenance/challenge indicators, without logging page bodies, cookies or headers. The captured full-text response is a regression fixture.

Official [Reader documentation](https://github.com/jina-ai/reader/blob/main/README.md#using-request-headers) distinguishes full DOM text from readability extraction and documents explicit completion timing. A Mac check with an injected incomplete HTTP-200 response rejected that snapshot, then recovered all 10 live candidates/descriptions and four Simplii roles.

## Scheduling decision

The recurring Saturday-morning failure and later recovery suggest an availability window, rather than independent random runner IP failures. Workday's [tenant notices](https://community-content.workday.com/en-us/public/get-help/support/support-notifications-and-alerts/tenant-status-system-notices.html) document weekly maintenance. The [CSU operator's current calendar](https://workday.csusystem.edu/maintenance-schedule/) documents Saturday weekly downtime and longer monthly/quarterly windows. These do not prove that CIBC's specific October 3 response was maintenance, and calendars may differ by tenant.

An optional scheduling proposal is daily collection at 18:00 UTC, replacing 06:00 UTC. It sits beyond the observed morning failures and documented extended morning windows, while retaining exactly two Vercel crons. It would also move the collect Sentry monitor. Tradeoff: all daily company feeds would refresh 12 hours later; reporting would keep its existing schedule and use the prior day's collection. This PR leaves the current 06:00 schedule untouched while Todd decides whether that freshness tradeoff is acceptable. Scheduling is a separate decision; parser hardening cannot establish that maintenance caused the historical outage.

## Verification and remaining limits

- Read-only `scripts/check-cibc-live.ts --incomplete-first` forces direct listing/detail challenges, injects an incomplete Reader response, then demands nonempty candidates, every full description and actual Simplii classification. It never calls Supabase, ingest, Gemini or email.
- The `--incomplete-only` mode verifies three invalid snapshots exhaust the budget with exit 1, three response artifacts and no success summary; no details or ingest can run.
- `cibc-live-check.yml` verifies exhaustion and runs that source check for relevant PRs and manual dispatch; public responses remain available as artifacts even if the check fails. An actually empty careers day deliberately fails this smoke rather than presenting it as recovered data. Production separately accepts a verified zero-count page.
- This is verified source-to-description-to-classification coverage, not proof that production database ingestion ran on the new code. The original production run remains failed. Next scheduled production collection after an approved deployment is the ingestion check.
- The relay remains an external dependency without guaranteed availability. The fallback refuses search results beyond 20 candidates until pagination is implemented. Full incumbent CIBC mode still fails on direct blocks; this fallback is Simplii-only.
- A prolonged origin outage cannot be fixed by headers or retries. If failures persist outside the morning window, use the saved response artifacts to decide between an employer-provided feed, approved stable egress, or a durable per-source deferred scheduler. Do not replace a complete corpus with search snippets or the capped Workday sitemap.
- Local `gh` authentication is invalid; git's keychain access and the connected GitHub tools work. Neither `~/.codex/memories_v2` nor `~/.codex/memories` exists in this environment, and no `memory_summary.md` was found. No memories or prior working trees were modified.
