import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminPage } from "@/lib/auth/admin";
import { getLabsExperiment } from "@/lib/navigation";
import { getPromptForgeInitialData } from "@/lib/labs/prompt-forge";
import { PromptForgeLab } from "@/components/labs/PromptForgeLab";

export default async function PromptForgePage() {
  const { profile } = await requireAdminPage();
  const experiment = getLabsExperiment("prompt-forge", profile?.role ?? undefined);
  const initialData = await getPromptForgeInitialData();

  return (
    <div className="mx-auto max-w-7xl space-y-6">
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
            {experiment?.title ?? "Prompt Forge"}
          </h1>
          <span className="inline-flex items-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white">
            {experiment?.status ?? "Beta"}
          </span>
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-700">
            Admin only
          </span>
        </div>
        <p className="max-w-4xl text-sm leading-7 text-muted-foreground">
          Battle prompt variants against live company data, score them on signal quality,
          and ship the winning model and prompt back into production.
        </p>
      </div>

      <PromptForgeLab initialData={initialData} />
    </div>
  );
}
