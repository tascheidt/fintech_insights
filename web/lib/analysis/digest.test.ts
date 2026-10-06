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
  buildStrategySignals,
  type CompanyWeeklySummary,
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
  it("does not call an established smaller role area new when it falls outside the five largest themes", () => {
    const history = [
      ...Array.from({ length: 10 }, () => ({ title: "Software Engineer", standardized_department: "Engineering" })),
      ...Array.from({ length: 9 }, () => ({ title: "Operations Analyst", standardized_department: "Operations" })),
      ...Array.from({ length: 8 }, () => ({ title: "Financial Analyst", standardized_department: "Finance" })),
      ...Array.from({ length: 7 }, () => ({ title: "Product Designer", standardized_department: "Product" })),
      ...Array.from({ length: 6 }, () => ({ title: "Risk Analyst", standardized_department: "Risk" })),
      { title: "Sales Representative", standardized_department: "Sales" },
    ];
    const allThemes = aggregateRoleThemes(history, Infinity);
    expect(allThemes.length).toBeGreaterThan(5);
    const company = { company_id: "acme", company_name: "Acme", company_slug: "acme", jobs: [makeJob("Sales Representative", "Sales")] };
    const result = buildWeeklyDigestCompanyInput(company, {
      currentOpenJobCount: 1, yearToDateJobCount: history.length,
      openRoleThemes: [], yearToDateRoleThemes: allThemes,
    });
    expect(result.new_themes).toEqual([]);
    expect(result.continuity).toBe("continuing");
  });

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

describe("buildStrategySignals", () => {
  it("requires a complete editorial signal and never duplicates a company body", () => {
    const pattern = buildWeeklyDigestCompanyInput({
      company_id: "acme", company_name: "Acme", company_slug: "acme",
      jobs: [makeJob("Platform Engineer", "Engineering")],
    }, { currentOpenJobCount: 1, yearToDateJobCount: 0, openRoleThemes: [], yearToDateRoleThemes: [] });
    const company: CompanyWeeklySummary = {
      company_id: "acme", company_name: "Acme", company_slug: "acme",
      new_job_count: 1, current_open_job_count: 1, year_to_date_job_count: 0,
      departments: {}, dominant_tech: [], seniority_breakdown: {}, jobs: [], hiring_pattern: pattern,
      ai_commentary: { headline: "Acme adds platform engineering role", body: "The Platform Engineer listing covers infrastructure tooling.", new_signal: null },
    };
    expect(buildStrategySignals([company])).toEqual([]);
    company.ai_commentary.new_signal = "The platform opening includes";
    expect(buildStrategySignals([company])).toEqual([]);
    company.ai_commentary.new_signal = "A Platform Engineer opening adds infrastructure capacity.";
    const [signal] = buildStrategySignals([company]);
    expect(signal.detail).toBe(company.ai_commentary.new_signal);
    expect(signal.detail).not.toBe(company.ai_commentary.body);
    expect(signal.interpretation).toBe("");
  });
});
