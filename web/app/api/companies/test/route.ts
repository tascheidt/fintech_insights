import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchJobs } from "@/lib/scrapers";
import { z } from "zod";

const bodySchema = z.object({ atsType: z.string(), atsIdentifier: z.string() });

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "atsType and atsIdentifier required" }, { status: 400 });

  try {
    const jobs = await fetchJobs(parsed.data.atsType, parsed.data.atsIdentifier);
    return NextResponse.json({ success: true, jobCount: jobs.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg });
  }
}
