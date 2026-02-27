# Optimize LLM Usage: Centralize & Manage Gemini Calls

## TL;DR
Gemini API calls are duplicated across 12+ modules (analysis libs, API routes, scripts). Each place instantiates its own client, checks `GEMINI_API_KEY`, and picks models/fallbacks independently. This is hard to manage, test, and observe. Introduce a shared LLM client/service and migrate all call sites to use it.

## Current state
- **Where:** `web/lib/analysis/*` (structure, strategic, company-research, company-insights, categorizer, advanced-strategic, digest), `web/app/api/**/chat/route.ts`, backfill scripts.
- **Pattern:** Every caller does `const key = process.env.GEMINI_API_KEY` → check → `new GoogleGenerativeAI(key)` → `getGenerativeModel({ model: "gemini-3-flash-preview" | "gemini-pro-latest" })` → `generateContent(...)`.
- **Inconsistencies:** Mixed error handling (throw vs warn vs skip), differing fallback behavior (Pro→Flash in some places, not others), no shared retries, logging, or cost/token tracking.
- **Result:** Hard to change models, add rate limiting, mock for tests, or understand usage/cost.

## Expected outcome
- **Single LLM client/service** at `web/lib/llm/` used by all analysis, chat, and scripts.
- **Unified config:** Model selection (Flash vs Pro), fallbacks, and env checks in one place.
- **Observability:** Optional logging of model, token usage, latency; easier to add metrics later.
- **Testability:** Client can be mocked or swapped for fixtures in tests.
- **Easier evolution:** Retries, rate limiting, circuit breakers, or future model swaps applied once.

## Relevant files
- **New:** `web/lib/llm/client.ts` — shared client + `generateContent` wrapper.
- **Migrate:** `web/lib/analysis/structure.ts`, `strategic.ts`, `company-research.ts`, `company-insights.ts`, `categorizer.ts`, `advanced-strategic.ts`, `digest.ts`.
- **Migrate:** `web/app/api/insights/[id]/chat/route.ts`, `web/app/api/companies/[id]/insights/[insightId]/chat/route.ts`.
- **Migrate:** `web/scripts/backfill-insight-display-fields.ts` (and other backfills that use Gemini).

## Risk / notes
- **Scope:** Migration is mostly find‑replace plus minor refactors; low risk if client API mirrors current `generateContent` usage.
- **Backfill scripts:** Can migrate when touched, or batch as follow-up.
- **Chat routes:** Pro vs Flash and tool use (e.g. grounding) must be preserved; client should support model selection per call.
- **Quotas:** Central client makes it easier to add rate limiting or backoff if we hit Gemini limits.

## Labels
- **Type:** improvement
- **Priority:** normal
- **Effort:** medium
