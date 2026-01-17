import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const bodySchema = z.object({
  name: z.string().min(1),
  country: z.string().min(1),
  atsType: z.enum(["lever", "greenhouse", "workable", "workday", "custom"]),
  atsIdentifier: z.string().min(1),
  trackForStrategy: z.boolean().optional().default(false),
  careersUrl: z.string().optional(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("organization_id, role").eq("id", user.id).single();
  if (!profile?.organization_id) return NextResponse.json({ error: "No organization" }, { status: 403 });
  if (!["editor", "admin"].includes(profile.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const slug = slugify(parsed.data.name);
  const { data, error } = await supabase
    .from("companies")
    .insert({
      organization_id: profile.organization_id,
      name: parsed.data.name,
      slug,
      country: parsed.data.country,
      track_for_strategy: parsed.data.trackForStrategy,
      ats_type: parsed.data.atsType,
      ats_identifier: parsed.data.atsIdentifier,
      careers_url: parsed.data.careersUrl || null,
      is_active: true,
      created_by: user.id,
    })
    .select("id, slug")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
