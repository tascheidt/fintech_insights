import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { log } from "@/lib/log";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/digests
 * List all weekly digests with pagination
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const queryParsed = querySchema.safeParse({
    limit: req.nextUrl.searchParams.get("limit") ?? undefined,
    offset: req.nextUrl.searchParams.get("offset") ?? undefined,
  });
  if (!queryParsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: queryParsed.error.issues },
      { status: 400 }
    );
  }
  const { limit, offset } = queryParsed.data;

  const { data: digests, error } = await supabase
    .from("weekly_digests")
    .select("*")
    .order("generated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    log.error({ err: error }, "Error fetching digests");
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ digests: digests || [] });
}
