# Senior Architect -- Memory

## Project: Fintech Talent Brief

### Gemini cost-reduction playbook (April 2026)

Started at ~$1.50–$1.90/day Gemini spend (forecast $51/month, +23.5% vs March). Shipped as a phased, measurement-first effort across PRs #55–#60. Future work in this area should follow the same discipline: measure first, ship one change per PR, attach the comparison report.

**Phase 0 (#55) — `-latest` alias migration.** Swapped every pinned preview ID to the floating alias convention. Rationale: model rotations land without code changes; `-latest` may point to preview/experimental, detected by Phase-1 harness and Phase-5 telemetry.

**Phase 1 (#56) — meter + compare harness + committed baselines.** Non-optional prerequisite: never optimize without a baseline. Built `web/lib/ai/gemini-meter.ts` (`recordUsage`, `UsageRecord`), `web/scripts/gemini-compare.ts`, and the seeded 20-job fixture. Baselines committed in `web/scripts/artifacts/`. Two headline numbers worth remembering:
- `extract-structure` per-job: ~$0.0015 (Flash), ~9s latency, 13% retry rate.
- `analyze-advanced` per-job: ~$0.089 (2 Pro+grounded calls), ~30s latency.

**Phase 2 (#57) — description-hash gate on re-extraction.** Migration adds `job_postings.description_hash` with in-migration pgcrypto backfill. `processor.ts` skips `extractAndUpdateStructure` on unchanged descriptions. Null hash = treat as changed (safe first-scrape behavior). This is the dominant Flash-tier saving in production — every daily scrape that repeats unchanged descriptions becomes free.

**Phase 3 (#58) — drop duplicate Pro+grounded pre-fetch.** One-line change: `advanced-strategic.ts` no longer calls `performWebSearch` by default; the main analysis call already has `googleSearch` tool enabled and grounds in-flight. Measured −51% analyze cost with 100% agreement on `is_new_direction` / `is_executive_movement` / `confidence` / `novelty_score`. `category` dropped to 70% — accepted as defensible reclassifications rather than gamed with a lowered threshold.

**Phase 4 (#59) — Flash-Lite routing evaluation.** Negative result: 78% cheaper, 83% faster, 0 retries, but L1 agreement 80% on `function_category` and `seniority_level` vs the 95% bar. One hard error (`Senior Backend Engineer → fraud-trust-safety`) disqualified the swap. Tooling + enum entry shipped so this is easy to re-evaluate after Google rotates the alias or the prompt changes.

**Phase 5 (#60) — production telemetry.** `gemini_usage_events` table + `writeUsageEvent` fire-and-forget sink + 15 production call-sites wired. Captures `model_served` distinct from `model_requested` so the silent Pro→Flash fallback is observable.

**Phase 6 — explicitly optional.** Novelty-gated Pro routing, company-insight content-hash cache, extract-prompt trim. The user's stance (2026-04-19): *"we may never do phase 6."* Pursue ONLY if Phase-5 telemetry shows residual waste after Phase 2 and Phase 3 land in production.

### Architectural patterns worth preserving

- **Fire-and-forget telemetry.** `gemini-telemetry.ts` never awaits and swallows errors. A flaky DB insert does not block a user request. Apply this pattern whenever observability is added to a hot path.
- **Content-hash gate.** Phase 2 pattern applies broadly: when re-work is cheap to detect (hash the input, compare to stored), always gate on it. Candidates for the same pattern: company-insight regeneration, weekly digest commentary per company.
- **Negative-result PRs.** Phase 4 shipped measurement tooling + committed evidence without changing production. Preserves the work and documents the "we tried, here's why not" for future reviewers.
- **Measure at the boundary.** `recordUsage` + `writeUsageEvent` at every call-site, not a central interceptor. Each site knows its call-site label and `extra` context better than a global hook could.

### Live ingestion path (sacred)
```
processor.ts → [description_hash gate] → extractAndUpdateStructure → extractJobStructure (Flash)
analyzer.ts → analyzeJobAdvanced (Pro+grounded, in-flight grounding, no pre-fetch)
```
Two Gemini calls per new job (not three, not one). Protect this shape — the history of miscounting call-sites was the origin of the April cost debugging round.

### Cost drivers and their levers

| call-site | per-call cost (2026-04 measured) | primary lever |
|---|---|---|
| `analyzeJobAdvanced` (Pro+grounded) | ~$0.043 | novelty-gated routing (Phase 6 candidate) |
| `performWebSearch` (pre-fetch) | ~$0.043 | dropped in Phase 3 |
| `extractJobStructure` (Flash) | ~$0.0015 | hash gate (Phase 2) |
| `generateCompanyInsight` | ~$0.01–0.02 | content-hash cache (Phase 6 candidate) |
| Grounding surcharge | $0.035/request flat | remove grounding where prompt doesn't need fresh news |

Any grounded call is ~$0.035 even at zero tokens — scrutinize it before merge.

### Known dead code on the ingestion path
- `strategic.ts#analyzeJob` — exported only.
- `categorizer.ts#categorizePosting` — backfill script only.
- The 8000-char description cap in `strategic.ts` — on the dead branch; the live `advanced-strategic.ts` has no cap.

If a future change needs to wire these in, that's an explicit architectural decision, not a drive-by.

### Silent Pro→Flash fallback
Lives at `advanced-strategic.ts:467-485`. Now observable via `gemini_usage_events.model_served`. Any new Pro call that doesn't capture `modelServed` distinctly is a regression.

### Measurement infrastructure
- Fixture: `web/scripts/fixtures/gemini-sample-jobs.json` (20 seeded jobs across 5 companies, min 500 description chars).
- Runner: `web/scripts/gemini-compare.ts` with `--scenario`, `--mode`, `--variant`, `--model`, `--limit`, `--dry-run`.
- Diff tools: `diff-analyze-artifacts.ts`, `diff-extract-artifacts.ts`, `project-hash-gate-savings.ts`.
- Baselines committed in `web/scripts/artifacts/` at specific git SHAs — reference them before any new optimization instead of regenerating.

### Pricing table caveat
`web/lib/ai/gemini-pricing.ts` is hand-maintained from Google's public pricing page and intended for relative trending only. Reconcile `estimated_usd` totals to Google Cloud billing monthly; expect drift. Update the constants when observed drift exceeds ~10%.

### Cron constraint
Max 2 Vercel crons per CLAUDE.md. Currently daily `/api/cron/collect` at 06:00 UTC and weekly `/api/cron/report` Mon 05:00 UTC. Any future scheduled quality-suite run must fold into one of these or replace the oldest entry.
