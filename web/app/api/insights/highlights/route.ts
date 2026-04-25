/**
 * Strategic Highlights API Endpoint
 * 
 * GET /api/insights/highlights
 * 
 * Fetches top strategic insights for dashboard display.
 * Returns company-level insights ranked by significance_score.
 * 
 * Query params:
 * - limit: Number of insights to return (default: 6, max: 20)
 * - days: How far back to look (default: 14)
 * 
 * @example
 * GET /api/insights/highlights?limit=6&days=14
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { log } from "@/lib/log";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(6),
  days: z.coerce.number().int().min(1).max(90).default(14),
});

// ============================================================================
// Types
// ============================================================================

interface HighlightResponse {
  id: string;
  companyId: string;
  companyName: string;
  companySlug: string;
  generatedAt: string;
  headline: string | null;
  keySignal: string | null;
  significanceScore: number | null;
  confidence: "high" | "medium" | "low";
  executiveSummary: string;
}

interface CompanyInsightRow {
  id: string;
  company_id: string;
  generated_at: string;
  headline: string | null;
  key_signal: string | null;
  significance_score: number | null;
  confidence: "high" | "medium" | "low";
  executive_summary: string;
  companies: { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[];
}

// ============================================================================
// GET Handler
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const auth = await requireUser();
    if (auth instanceof NextResponse) return auth;
    const { supabase } = auth;

    const queryParsed = querySchema.safeParse({
      limit: req.nextUrl.searchParams.get("limit") ?? undefined,
      days: req.nextUrl.searchParams.get("days") ?? undefined,
    });
    if (!queryParsed.success) {
      return NextResponse.json(
        { error: "Invalid query", issues: queryParsed.error.issues },
        { status: 400 }
      );
    }
    const { limit, days } = queryParsed.data;

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    // Fetch insights with company data
    const { data: insights, error } = await supabase
      .from("company_insights")
      .select(`
        id,
        company_id,
        generated_at,
        headline,
        key_signal,
        significance_score,
        confidence,
        executive_summary,
        companies!inner(id, name, slug, is_active)
      `)
      .eq("companies.is_active", true)
      .gte("generated_at", cutoffDate.toISOString())
      .order("significance_score", { ascending: false, nullsFirst: false })
      .order("generated_at", { ascending: false })
      .limit(limit);
    
    if (error) {
      log.error({ err: error }, "Error fetching highlights");
      return NextResponse.json(
        { error: "Failed to fetch highlights" },
        { status: 500 }
      );
    }
    
    // Transform response
    const highlights: HighlightResponse[] = (insights as CompanyInsightRow[] ?? []).map((insight) => {
      const company = Array.isArray(insight.companies)
        ? insight.companies[0]
        : insight.companies;
      
      return {
        id: insight.id,
        companyId: insight.company_id,
        companyName: company?.name ?? "Unknown",
        companySlug: company?.slug ?? "",
        generatedAt: insight.generated_at,
        headline: insight.headline,
        keySignal: insight.key_signal,
        significanceScore: insight.significance_score,
        confidence: insight.confidence,
        executiveSummary: insight.executive_summary,
      };
    });
    
    // Get tracked company count
    const { count: trackedCompanyCount } = await supabase
      .from("companies")
      .select("*", { count: "exact", head: true })
      .eq("is_active", true);
    
    return NextResponse.json({
      highlights,
      meta: {
        limit,
        days,
        trackedCompanyCount: trackedCompanyCount ?? 0,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    log.error({ err: error }, "Highlights API error");
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
