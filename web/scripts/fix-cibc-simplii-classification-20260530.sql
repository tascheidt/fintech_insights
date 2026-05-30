-- One-off data correction: re-classify the CIBC / Simplii job_postings family
-- after the Simplii classifier fix (see web/lib/scrapers/workday-cibc.ts).
--
-- Background: the old classifier walked EVERY field of the Workday listing row
-- and mass-mis-tagged 504 CIBC jobs as Simplii in the 2026-05-25 run. The new
-- rule: a job is Simplii iff its TITLE matches /\bsimplii\b/i OR its DESCRIPTION
-- contains >=2 "simplii" mentions; everything else is CIBC.
--
-- Because later (correct) runs re-created most of those jobs under CIBC, 506 of
-- the 507 Simplii rows already had a CIBC twin sharing the same external_id.
-- This script collapses each (CIBC, Simplii) external_id duplicate into ONE row
-- under the correct company, preserving the earliest first_seen_date and latest
-- last_seen_date, and reparents the loser's strategic_insights to the survivor
-- so no AI analysis is cascade-deleted.
--
-- Idempotent: re-running is a no-op once each external_id is a single row under
-- its rule-correct company.
--
-- Run via the Supabase MCP / service role. CIBC=e531edb5-..., Simplii=d52f2e0f-...
-- A backup of the pre-change family lives in
-- job_postings_simplii_fix_backup_20260530 / strategic_insights_simplii_fix_backup_20260530.

do $$
begin
  create temp table _simplii_fix on commit drop as
  with fam as (
    select jp.id, jp.external_id, jp.is_active, jp.first_seen_date, jp.last_seen_date,
      (lower(coalesce(jp.title,'')) ~ '\msimplii\M') as title_has,
      regexp_count(lower(coalesce(jp.description_text,jp.description_html,'')),'simplii',1,'i') as desc_count,
      length(coalesce(jp.description_text,jp.description_html,'')) as desc_len
    from job_postings jp
    where jp.company_id in ('e531edb5-41f1-4db0-b8bc-f093883587f0','d52f2e0f-f365-4b83-872a-39010df1494b')
  ),
  grp as (
    select external_id, bool_or(title_has) as any_title, max(desc_count) as max_desc,
      bool_or(is_active) as any_active, min(first_seen_date) as min_first, max(last_seen_date) as max_last
    from fam group by external_id
  ),
  target as (
    select external_id, any_active, min_first, max_last,
      case when any_title or max_desc >= 2
        then 'd52f2e0f-f365-4b83-872a-39010df1494b'
        else 'e531edb5-41f1-4db0-b8bc-f093883587f0' end::uuid as target_company
    from grp
  ),
  ranked as (
    select id, external_id,
      row_number() over (partition by external_id order by is_active desc, last_seen_date desc nulls last, desc_len desc, id) as rn,
      first_value(id) over (partition by external_id order by is_active desc, last_seen_date desc nulls last, desc_len desc, id) as survivor_id
    from fam
  )
  select r.id, r.external_id, (r.rn = 1) as is_survivor, r.survivor_id,
    t.target_company, t.min_first, t.max_last, t.any_active
  from ranked r join target t using (external_id);

  -- 1. Reparent loser strategic_insights to the survivor (no unique constraint
  --    on job_posting_id, so collision-free) so cascade-delete cannot drop AI
  --    analysis the survivor lacks.
  update strategic_insights si
    set job_posting_id = f.survivor_id
  from _simplii_fix f
  where si.job_posting_id = f.id and f.is_survivor = false;

  -- 2. Delete the duplicate (loser) job_postings rows.
  delete from job_postings
  where id in (select id from _simplii_fix where is_survivor = false);

  -- 3. Re-tag survivors to the correct company and merge lifecycle dates.
  update job_postings jp
    set company_id = f.target_company,
        first_seen_date = f.min_first,
        last_seen_date = f.max_last,
        is_active = f.any_active
  from _simplii_fix f
  where jp.id = f.id and f.is_survivor = true;
end $$;
