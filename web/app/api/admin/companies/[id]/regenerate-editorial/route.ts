import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import {
  generateCompanyEditorial,
  applyEditorialToCompany,
} from "@/lib/analysis/company-editorial";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/log";

/**
 * Admin trigger for the editorial engine. Regenerates `companies.thesis /
 * thesis_sub / interpretation / bets / last_change` for one company by id.
 *
 * Auth: admin role. Idempotent — calling twice produces a fresh run.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json(
      { error: "company id required" },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();
  const { data: company, error } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();

  if (error || !company) {
    return NextResponse.json(
      { error: error?.message ?? "company not found" },
      { status: 404 }
    );
  }

  try {
    const editorial = await generateCompanyEditorial(company.id, company.name);
    await applyEditorialToCompany(company.id, editorial);
    return NextResponse.json({
      ok: true,
      thesis: editorial.thesis,
      betCount: editorial.bets.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err: message, companyId: company.id }, "[editorial] regenerate failed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
