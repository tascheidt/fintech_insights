# Ingestion pipeline reality

> Pulled out of root `CLAUDE.md` so the hot-path description has room to breathe. Keep this file truthful — if you change the order of operations in `processor.ts` / `analyzer.ts`, update this doc in the same PR.

## Live per-job hot path

After a `collect` run picks up new postings, every job traverses:

```
processor.ts  → [description_hash gate]  → extractAndUpdateStructure  → extractJobStructure  (Flash)
analyzer.ts   → analyzeJobAdvanced  (Pro + grounded; in-flight grounding, no pre-fetch)
```

That's it. Any "analysis" function not named above is *not* on the live path.

## The `description_hash` gate

The gate in [`web/lib/jobs/processor.ts`](../web/lib/jobs/processor.ts) skips `extractAndUpdateStructure` when the scraped description's SHA-1 matches what's already stored on the `job_postings` row. Null stored hashes are treated as "changed" so the first scrape post-deploy still populates everything.

Why this matters: re-running `collect` on a stable career page will *not* re-pay for Flash extraction. If you add a new field to the structure schema, you need to either bump a config version or null-out hashes on a backfill so the gate re-fires.

## Closed-job detection and the mass-closure floor

`runIngestStage` closes a req by set difference: any active `job_postings` row for the company whose `external_id` did **not** appear in this scrape gets `is_active=false` + `closed_date`. This is correct *only* if the scrape is the complete corpus.

A truncated scrape breaks that assumption and looks identical to "everything else closed." The May 2026 Workday pagination bug returned ~50 of ~1,500 jobs and the loop dutifully closed the other ~1,450; a heavy scrape killed part-way would do the same. Guard: `exceedsClosureFloor(activeCorpus, wouldClose)` (pure, unit-tested in `processor.test.ts`) — when a single run would close more than **30%** of a company's active corpus (above a `minActiveCorpus` of 20, so small boards can legitimately shed most of their few reqs), closure for that company is **skipped entirely**, logged as `log.error` (`[ingest] mass-closure floor tripped …`), and recorded on `job_run_tasks.stage_progress.ingest.closureSkipped`.

The bias is deliberate: a stale-open req is cheap to reconcile on the next clean scrape; a false mass-close corrupts every dashboard aggregate until a human notices. A *genuine* large permanent drop will keep tripping the floor every run — that recurring `log.error` is the signal to confirm and intervene, not a bug. Note this floor is a safety net, not a completeness signal: it does not (yet) know `totalHits`; it infers "truncated" purely from the closure proportion.

## `analyzeJobAdvanced` and grounding

`analyzeJobAdvanced` (in `web/lib/analysis/advanced-strategic.ts`) used to run a duplicate `performWebSearch` pre-fetch before the main grounded call. Phase 3 dropped that default because the main call already has `googleSearch` enabled — the pre-fetch was paying for the same web data twice.

Callers that want a shared pre-fetch (the batch-analysis helper, eval scripts) still pass `webSearchContext` explicitly. Don't add a third call site that pre-fetches by default.

## Off-path analysis (do not wire in without a decision)

These exist for backfill or legacy flows and are intentionally *not* reached from `processor.ts`/`analyzer.ts`:

- `analyzeJob` in [`web/lib/analysis/strategic.ts`](../web/lib/analysis/strategic.ts) — legacy single-job analyzer with an 8000-char description cap. Don't assume that cap applies to production.
- `categorizePosting` in [`web/lib/analysis/categorizer.ts`](../web/lib/analysis/categorizer.ts) — backfill categorizer.

If you find yourself wanting to call one of these from a new ingestion-time hook, escalate first. The live pipeline is intentionally two AI calls per job; adding a third is a cost decision.
