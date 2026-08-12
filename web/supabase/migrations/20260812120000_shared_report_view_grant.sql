-- ============================================================================
-- increment_shared_report_view — close the `authenticated` EXECUTE grant
-- ============================================================================
--
-- 20260731000000_shared_search_reports.sql revoked EXECUTE from PUBLIC and from
-- `anon`, but not from `authenticated`. Supabase's default privileges then left
-- the function reachable at /rest/v1/rpc/increment_shared_report_view by any
-- signed-in user — flagged by database-linter 0029 the moment the migration was
-- applied to production (2026-08-12).
--
-- The function is SECURITY DEFINER and takes a report id, so a signed-in caller
-- who learned a report's UUID could inflate that report's view_count. Not a read
-- of anything private, but the counter is the only usage signal the sender has,
-- and nothing legitimate calls this from a user session: `recordReportView`
-- (web/lib/reports/store.ts) runs on the service-role client, which holds its own
-- grant and is unaffected.
--
-- Compare `feedback_duplicate_candidates` in 20260731120000, which revokes from
-- all three roles and ends up with exactly {postgres, service_role}. This brings
-- the shared-report counter to the same shape.

REVOKE EXECUTE ON FUNCTION public.increment_shared_report_view(UUID)
  FROM anon, authenticated, public;
