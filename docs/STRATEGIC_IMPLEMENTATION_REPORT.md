# Strategic Intent & Implementation Report

**To:** CTO  
**From:** Technical Lead  
**Date:** January 18, 2026  
**Subject:** Fintech Intelligence Platform - Phase 2 Strategy & Architecture Review

## 1. Executive Summary

This report outlines the strategic direction and technical implementation for Phase 2 of the Fintech Intelligence Platform. We are successfully transitioning from a prototype CLI (Python) to a production-grade Web Application (Next.js/Vercel).

**Key Headline:** Our primary strategic focus is **Deep Strategic Intelligence** (market signals, competitor moves) rather than broad recruitment efficiency. We are leveraging **Gemini 3.0** for advanced reasoning and have deprecated the legacy Python infrastructure in favor of a unified TypeScript serverless architecture.

---

## 2. Strategic Intent

### Primary Objective: Strategic Intelligence
The platform is designed to serve Executives and Strategy Teams, not Recruiters. The core value proposition is **Early Warning & Market Signal Detection**.
- **Input:** Tracking ~20-50 high-priority competitors.
- **Analysis:** Using AI to infer strategic intent (e.g., "Competitor X is building a Crypto division" or "Competitor Y is expanding to Germany") based on hiring patterns.
- **Output:** High-signal executive reports, not just job lists.

### Deprioritized Areas
- **Job Templates:** While initially considered, the "Template Library" feature for recruitment efficiency is **deprioritized**. We will not invest engineering resources in scaling this feature in Phase 2.
- **Mass Scale:** We are **not** optimizing for hundreds of companies. We are optimizing for depth and reliability on a targeted set of competitors.

### Data Strategy
- **Longitudinal Retention:** We will store full HTML job descriptions indefinitely. This allows us to re-run analysis with future, more capable AI models to uncover trends we might miss today.

---

## 3. Implementation Status (Phase 2)

### Architecture Transition
We have completed the porting of core logic from the legacy Python CLI to a cloud-native Next.js architecture hosted on Vercel.

| Component | Phase 1 (Legacy/Python) | Phase 2 (Current/Next.js) | Status |
|-----------|------------------------|---------------------------|--------|
| **Runtime** | Local Python Scripts | Vercel Serverless Functions | ✅ **Complete** |
| **Database** | SQLite / CSV | Supabase (PostgreSQL) | ✅ **Complete** |
| **Scraping** | Local Selenium/BS4 | Puppeteer Core (Serverless) | ✅ **Complete** |
| **AI Model** | Gemini 2.0 Flash | **Gemini 3.0 Flash/Pro** | ✅ **Upgraded** |
| **Language** | Python 3.9 | TypeScript / Node.js | ✅ **Complete** |

**Action Item:** The `src/` directory (Python CLI) is now officially deprecated and will be archived. All development focus is on `web/`.

### AI Implementation
We have integrated **Google Gemini 3.0**:
- **Categorization:** Uses `gemini-3-flash-preview` for low-latency, high-accuracy role classification.
- **Strategic Analysis:** Uses `gemini-pro-latest` for complex reasoning tasks, specifically "Novelty Scoring" and "Executive Movement Detection."

---

## 4. Architectural Recommendations

While the "Serverless First" approach on Vercel aligns with our agility goals, it introduces specific challenges for long-running scraping jobs.

### The Challenge: Vercel Timeouts
Vercel Serverless Functions have strict execution limits (10s default, up to 60s-300s on paid plans). Browser-based scraping (e.g., for Workday/Tangerine) often exceeds these limits even for a single company.

### Recommended Pattern: Async Job Queue
To ensure reliability without managing complex infrastructure, we are implementing a **"Fan-Out" Architecture**:

1.  **Trigger:** Cron job hits `/api/cron/collect`.
2.  **Dispatch:** Instead of processing loop, it creates a `JobRun` in Supabase and dispatches individual `JobTask` events.
3.  **Execution:**
    *   **Option A (Current):** Sequential processing (Risky for browser scrapes).
    *   **Option B (Recommended):** Use **QStash** or **Supabase Edge Functions** to trigger each scraper independently. This isolates failures; if "Company A" times out, "Company B" still succeeds.

### Infrastructure Decisions
- **Scraping Host:** We will continue using Vercel for API-based scrapers (Lever, Greenhouse). For heavy browser scrapers, we may need to offload specific tasks to a containerized worker (e.g., Railway/Fly.io) if Vercel constraints become blocking.
- **Storage:** Supabase Storage will be used to archive raw HTML snapshots, keeping the relational DB clean.

---

## 5. Roadmap & Next Steps

### Immediate Priorities (Weeks 1-4)
1.  **Finalize Deprecation:** Remove `src/` and archive legacy scripts.
2.  **Reliability Hardening:** Implement the Async Job Queue pattern to prevent timeouts.
3.  **Report Generation:** Build the frontend view for the "Executive Report" using the new Gemini 3.0 insights.

### Quarterly Goals (Q1)
1.  **Historical Backfill:** Import historical data from Phase 1 CSVs into Supabase.
2.  **Trend Analysis:** Activate "Hiring Velocity" metrics in the dashboard.
3.  **Alerting:** Implement email notifications for "High Confidence" strategic signals.

---

### Questions for Approval
1.  **QStash/Queue:** Approval to add a queueing service (e.g., Upstash QStash, ~$10/mo) to the stack to handle the async job orchestration?
2.  **Legacy Data:** Should we migrate the SQLite data from Phase 1, or start fresh in Supabase? (Recommendation: Migrate for trend continuity).
