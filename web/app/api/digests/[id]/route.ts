import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { log } from "@/lib/log";

const paramsSchema = z.object({ id: z.string().uuid() });

/**
 * GET /api/digests/[id]
 * Get a single digest with all company summaries
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const paramsParsed = paramsSchema.safeParse(await params);
  if (!paramsParsed.success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const { id } = paramsParsed.data;

  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  // Fetch digest
  const { data: digest, error: digestError } = await supabase
    .from("weekly_digests")
    .select("*")
    .eq("id", id)
    .single();

  if (digestError || !digest) {
    return NextResponse.json({ error: "Digest not found" }, { status: 404 });
  }

  // Fetch company summaries
  const { data: companies, error: companiesError } = await supabase
    .from("weekly_digest_companies")
    .select(`
      *,
      companies!inner(id, name, slug)
    `)
    .eq("digest_id", id)
    .order("new_job_count", { ascending: false });

  if (companiesError) {
    log.error({ err: companiesError }, "Error fetching digest companies");
    return NextResponse.json({ error: companiesError.message }, { status: 500 });
  }

  return NextResponse.json({
    digest,
    companies: companies || [],
  });
}
