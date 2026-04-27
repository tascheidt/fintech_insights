import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/guards";
import { suggestBets } from "@/lib/analysis/bet-suggester";

/**
 * Rule-based bet suggestions for an editor about to fill out the editorial.
 * Auth: admin (matches the EditCompanyEditorialForm gate).
 *
 * Idempotent and cheap — no AI calls. Safe to call on every form load.
 */
export async function GET(
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

  try {
    const suggestions = await suggestBets(id);
    return NextResponse.json({ suggestions });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
