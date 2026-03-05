/**
 * TB Labs Page
 *
 * Experimental features for strategic analysis and visualization.
 * Currently features: Strategy Inference — clusters job postings into
 * inferred strategic initiatives using AI analysis.
 */

import { createClient } from "@/lib/supabase/server";
import { StrategyAnalyzer } from "@/components/labs/StrategyAnalyzer";

export default async function LabsPage() {
  const supabase = await createClient();

  // Fetch active companies for the selector
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">TB Labs</h1>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
            Experimental
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Prototype tools for deeper hiring intelligence. Results are
          AI-generated and may not be fully accurate.
        </p>
      </div>

      {/* Strategy Analyzer */}
      <StrategyAnalyzer companies={companies ?? []} />
    </div>
  );
}
