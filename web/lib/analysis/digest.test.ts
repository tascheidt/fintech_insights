/**
 * Regression tests for the weekly-digest input builder.
 *
 * `buildWeeklyDigestCompanyInput` is the deterministic transformation that
 * sits between Supabase and the Gemini call. It decides the `continuity`
 * label that drives the global summary's "what's new this week" headline,
 * so a regression here would silently miscategorize companies.
 *
 * Two cases:
 *  - All weekly themes are present in the historical year-to-date set
 *    -> `continuity === "continuing"`.
 *  - No weekly themes are present in the historical set -> `continuity === "new_focus"`.
 *
 * The role classifier (`classifyJob` in role-themes.ts) is deterministic, so
 * we drive it with carefully chosen titles rather than mocking it.
 */

import { describe, it, expect } from "vitest";
import {
  buildWeeklyDigestCompanyInput,
  type CompanyJobData,
  type WeeklyJob,
} from "./digest";
import { aggregateRoleThemes, type RoleThemeSummary } from "./role-themes";

function makeJob(title: string, department: string | null = null): WeeklyJob {
  return {
    id: `job-${Math.random().toString(36).slice(2, 8)}`,
    title,
    url: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    standardized_department: department,
    seniority_level: null,
    tech_stack: [],
    first_seen_date: "2026-04-22T00:00:00.000Z",
    is_active: true,
  };
}

describe("buildWeeklyDigestCompanyInput", () => {
  it("flags continuity='continuing' when all weekly themes match the YTD set", () => {
    const weeklyJobs = [
      makeJob("Senior Backend Engineer", "Engineering"),
      makeJob("Staff Software Engineer", "Engineering"),
    ];
    // Historical jobs include an engineering role, so the engineering theme
    // is "continuing", not "new". Use real `aggregateRoleThemes` to keep
    // the fixture honest.
    const ytdRoleThemes: RoleThemeSummary[] = aggregateRoleThemes([
      { title: "Software Engineer", standardized_department: "Engineering" },
      { title: "Platform Engineer", standardized_department: "Engineering" },
    ]);

    const companyData: CompanyJobData = {
      company_id: "co-1",
      company_name: "Acme Fintech",
      company_slug: "acme",
      jobs: weeklyJobs,
    };

    const result = buildWeeklyDigestCompanyInput(companyData, {
      currentOpenJobCount: 12,
      yearToDateJobCount: 50,
      openRoleThemes: ytdRoleThemes,
      yearToDateRoleThemes: ytdRoleThemes,
    });

    expect(result.continuity).toBe("continuing");
    expect(result.new_themes).toEqual([]);
    expect(result.continuing_themes.length).toBeGreaterThan(0);
    expect(result.week_job_count).toBe(2);
    expect(result.year_to_date_job_count).toBe(50);
    expect(result.current_open_job_count).toBe(12);
  });

  it("flags continuity='new_focus' when no weekly themes match the YTD set", () => {
    // Engineering this week...
    const weeklyJobs = [
      makeJob("Senior Backend Engineer", "Engineering"),
      makeJob("Platform Engineer", "Engineering"),
    ];
    // ...but the YTD context only contains finance roles, so engineering is
    // entirely new this week.
    const ytdRoleThemes: RoleThemeSummary[] = aggregateRoleThemes([
      { title: "Senior Financial Analyst", standardized_department: "Finance" },
      { title: "Treasury Manager", standardized_department: "Finance" },
    ]);

    const companyData: CompanyJobData = {
      company_id: "co-2",
      company_name: "Newco Fintech",
      company_slug: "newco",
      jobs: weeklyJobs,
    };

    const result = buildWeeklyDigestCompanyInput(companyData, {
      currentOpenJobCount: 5,
      yearToDateJobCount: 8,
      openRoleThemes: ytdRoleThemes,
      yearToDateRoleThemes: ytdRoleThemes,
    });

    expect(result.continuity).toBe("new_focus");
    expect(result.continuing_themes).toEqual([]);
    expect(result.new_themes.length).toBeGreaterThan(0);
    expect(result.week_job_count).toBe(2);
  });
});
