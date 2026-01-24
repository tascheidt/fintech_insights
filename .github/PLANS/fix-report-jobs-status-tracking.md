# Unified Job Tracking: Migrate All Cron Jobs to job_runs

**Overall Progress:** `100%`

## TLDR
Fully migrate all scheduled jobs from `cron_logs` to `job_runs` table for unified tracking. This includes report jobs, company insights, and manual insight generation. Then remove `cron_logs` table and clean up all references in the codebase.

## Critical Decisions
- **Decision 1:** Migrate ALL cron jobs to `job_runs` table
  - Rationale: Unified tracking, consistent status handling, eliminates table mismatch bug
- **Decision 2:** Add new job types to `job_runs.job_type` CHECK constraint
  - New types: 'report', 'company-insights', 'insight-generation'
  - Current types: 'collect', 'analyze'
- **Decision 3:** Drop `cron_logs` table after migration
  - Rationale: No need for two logging tables, simplifies architecture
- **Decision 4:** Clean up all `cron_logs` references in codebase
  - Rationale: Remove dead code, update documentation

## Affected Files

### Cron Jobs (writes to cron_logs → migrate to job_runs)
- `web/app/api/cron/report/route.ts` - Weekly report generation
- `web/app/api/cron/company-insights/route.ts` - Company insights cron
- `web/app/api/companies/[id]/insights/route.ts` - Manual insight generation

### Admin Routes (reads from cron_logs → update to job_runs)
- `web/app/api/admin/stats/route.ts` - Dashboard stats (lines 49-50)
- `web/app/api/admin/cron-logs/route.ts` - Job execution history

### Documentation (references cron_logs → update)
- `CLAUDE.md` - Agent guidance file (add job_runs as standard for job tracking)
- `docs/VERCEL_CRON_TROUBLESHOOTING.md`
- `docs/CRON_VERIFICATION_STEPS.md`
- `docs/CRON_FIX_SUMMARY.md`
- `docs/CRON_FINAL_CHECKLIST.md`

## Tasks:

- [x] ✅ **Step 1: Database Schema Update**
  - [x] ✅ Create migration to expand `job_runs.job_type` CHECK constraint to include: 'collect', 'analyze', 'report', 'company-insights', 'insight-generation'
  - [x] ✅ Add `details` JSONB column to `job_runs` (if not exists) for storing job-specific metadata
  - [ ] 🟨 Run migration and verify all new job types can be inserted (manual step)

- [x] ✅ **Step 2: Migrate Report Cron Job**
  - [x] ✅ Replace `cron_logs` insert with `job_runs` insert
  - [x] ✅ Map fields: status 'running'→'running', 'success'→'completed', 'error'→'failed'
  - [x] ✅ Store digest stats in `job_runs` fields (total_insights, details JSONB)
  - [x] ✅ Update success/error status updates to use `job_runs`
  - [x] ✅ Remove all `cron_logs` references from report route

- [x] ✅ **Step 3: Migrate Company Insights Cron Job**
  - [x] ✅ Replace `cron_logs` inserts with `job_runs` inserts in company-insights route
  - [x] ✅ Map job_type "company-insights" to job_runs
  - [x] ✅ Store insight metadata in details JSONB
  - [x] ✅ Remove all `cron_logs` references from company-insights route

- [x] ✅ **Step 4: Migrate Manual Insight Generation**
  - [x] ✅ Replace `cron_logs` inserts with `job_runs` inserts in insights route
  - [x] ✅ Map job_type "company-insight-generation" to "insight-generation" in job_runs
  - [x] ✅ Store generation metadata in details JSONB
  - [x] ✅ Remove all `cron_logs` references from insights route

- [x] ✅ **Step 5: Update Admin Stats Route**
  - [x] ✅ Update lastCollectResult query to use `job_runs` with job_type='collect', status='completed'
  - [x] ✅ Update lastReportResult query to use `job_runs` with job_type='report', status='completed'
  - [ ] 🟨 Test admin dashboard shows correct "Last Job Collection" and "Last Weekly Report" (manual step)

- [x] ✅ **Step 6: Update Admin Cron Logs Route**
  - [x] ✅ Update job_type transformation to handle all new types: 'report', 'company-insights', 'insight-generation'
  - [x] ✅ Remove assumption that non-collect = report
  - [ ] 🟨 Test admin page displays all job types correctly with proper status badges (manual step)

- [ ] 🟨 **Step 7: Testing & Verification** (manual steps)
  - [ ] 🟨 Test report cron job: creates entry with 'running', updates to 'completed'/'failed'
  - [ ] 🟨 Test company insights cron: creates entry with correct type and status
  - [ ] 🟨 Test manual insight generation: creates entry with correct type and status
  - [ ] 🟨 Test admin stats route returns correct data
  - [ ] 🟨 Test admin cron logs displays all job types correctly
  - [ ] 🟨 Verify no errors in Vercel logs

- [x] ✅ **Step 8: Drop cron_logs Table** (included in Step 1 migration)
  - [x] ✅ Create migration to drop `cron_logs` table
  - [x] ✅ Drop associated indexes: idx_cron_logs_job_type, idx_cron_logs_started_at, idx_cron_logs_status
  - [x] ✅ Drop RLS policies on cron_logs
  - [ ] 🟨 Run migration and verify table is removed (manual step)

- [x] ✅ **Step 9: Codebase Cleanup**
  - [x] ✅ Search for any remaining `cron_logs` references in code
  - [x] ✅ Remove/update any imports or type definitions (none found)
  - [x] ✅ Update TypeScript types if any reference cron_logs (none found)
  - [ ] 🟨 Verify build passes with no cron_logs references (manual step)

- [x] ✅ **Step 10: Update CLAUDE.md (Agent Guidance)**
  - [x] ✅ Add "Job Tracking" section to CLAUDE.md under Architecture
  - [x] ✅ Document that `job_runs` is the ONLY table for tracking all job/cron execution
  - [x] ✅ List valid job_types: 'collect', 'analyze', 'report', 'company-insights', 'insight-generation'
  - [x] ✅ Document status values: 'pending', 'running', 'completed', 'failed'
  - [x] ✅ Add rule: "Never use cron_logs table (deprecated and removed)"
  - [x] ✅ Include example of how to log a job run

- [x] ✅ **Step 11: Documentation Cleanup**
  - [x] ✅ Update `docs/VERCEL_CRON_TROUBLESHOOTING.md` - change cron_logs to job_runs
  - [x] ✅ Update `docs/CRON_VERIFICATION_STEPS.md` - change cron_logs to job_runs
  - [x] ✅ Update `docs/CRON_FIX_SUMMARY.md` - change cron_logs to job_runs
  - [x] ✅ Update `docs/CRON_FINAL_CHECKLIST.md` - change cron_logs to job_runs
  - [x] ✅ Delete `.github/ISSUES/report-jobs-status-impact-analysis.md` (superseded)
  - [x] ✅ Delete `.github/ISSUES/report-jobs-stuck-running.md` (completed)

## Field Mapping Reference

### cron_logs → job_runs
| cron_logs field | job_runs field | Notes |
|-----------------|----------------|-------|
| job_type | job_type | Add new types to CHECK |
| status 'running' | status 'running' | Same |
| status 'success' | status 'completed' | Different value |
| status 'error' | status 'failed' | Different value |
| started_at | started_at | Same |
| completed_at | completed_at | Same |
| new_jobs_count | total_new_jobs | Same meaning |
| closed_jobs_count | total_closed_jobs | Same meaning |
| insights_generated | total_insights | Same meaning |
| companies_processed | total_companies | Same meaning |
| error_message | error_message | Same |
| details (JSONB) | details (JSONB) | Need to add column if missing |

### Required job_runs fields for new job types
```sql
-- For 'report' jobs
job_type: 'report'
trigger_type: 'cron'
scope: 'all'
status: 'pending' | 'running' | 'completed' | 'failed'
total_insights: number (companies in digest)
details: { digestId, totalJobs, emailSent, recipients, ... }

-- For 'company-insights' jobs
job_type: 'company-insights'
trigger_type: 'cron'
scope: 'single'
company_id: uuid
status: 'pending' | 'running' | 'completed' | 'failed'
total_insights: 1
details: { insightId, duration, estimatedCost, ... }

-- For 'insight-generation' jobs (manual)
job_type: 'insight-generation'
trigger_type: 'manual'
triggered_by: user_id
scope: 'single'
company_id: uuid
status: 'pending' | 'running' | 'completed' | 'failed'
total_insights: 1
details: { insightId, estimatedCost, ... }
```

## Rollback Plan
If issues occur:
1. Keep cron_logs table migration as separate final step
2. Can revert to dual-write (both tables) if needed
3. Admin routes can fallback to cron_logs if job_runs query fails
