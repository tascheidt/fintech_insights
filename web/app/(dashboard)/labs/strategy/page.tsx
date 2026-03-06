import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StrategyAnalyzer } from "@/components/labs/StrategyAnalyzer";
import { createClient } from "@/lib/supabase/server";
import { getLabsExperiment } from "@/lib/navigation";

export default async function StrategyLabPage() {
  const supabase = await createClient();
  const experiment = getLabsExperiment("strategy");

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("name");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/labs"
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Labs
      </Link>

      <div className="space-y-3">
        <div className="inline-flex items-center rounded-full border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          Talent Brief Labs
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            {experiment?.title ?? "Strategy Inference"}
          </h1>
          <span className="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white">
            {experiment?.status ?? "Experimental"}
          </span>
        </div>
        <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
          {experiment?.description ??
            "Analyze company hiring patterns and infer the strategic initiatives most likely driving them."}
        </p>
      </div>

      <StrategyAnalyzer companies={companies ?? []} />
    </div>
  );
}
