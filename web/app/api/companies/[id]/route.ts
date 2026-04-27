import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";

const evidenceSchema = z.object({
  when: z.string().max(80).optional().default(""),
  text: z.string().max(400),
  type: z.enum(["internal", "external"]).default("internal"),
});

const betSchema = z.object({
  id: z.string().optional(),
  title: z.string().max(160),
  claim: z.string().max(800).optional().default(""),
  pivot: z.enum(["new", "accel", "cont", "quiet"]),
  confidence: z.number().int().min(1).max(5),
  evidence: z.array(evidenceSchema).max(6).optional().default([]),
  forward_signal: z.string().max(400).optional().default(""),
  job_filter: z
    .object({
      function: z.string().max(120).optional(),
      theme: z.string().max(120).optional(),
    })
    .optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
  atsType: z.enum([
    "lever",
    "greenhouse",
    "workable",
    "ashby",
    "dayforce",
    "workday",
    "smartrecruiters",
    "successfactors",
    "bamboohr",
    "jazzhr",
    "recruitee",
    "custom",
  ]).optional(),
  atsIdentifier: z.string().min(1).optional(),
  careersUrl: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  // v2 editorial fields (added in 20260425_company_editorial_v2.sql)
  thesis: z.string().max(200).nullable().optional(),
  thesisSub: z.string().max(280).nullable().optional(),
  interpretation: z.string().max(600).nullable().optional(),
  lastChange: z.string().max(200).nullable().optional(),
  lastChangeAt: z.string().nullable().optional(), // "YYYY-MM-DD"
  bets: z.array(betSchema).max(6).optional(),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const { data: company, error } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  return NextResponse.json(company);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }
  if (!["editor", "admin"].includes(profile.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify company belongs to user's organization
  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id, organization_id, name")
    .eq("id", id)
    .single();

  if (!existingCompany) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }
  if (existingCompany.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  // Build update object
  const updates: Record<string, unknown> = {};
  
  if (parsed.data.name !== undefined) {
    updates.name = parsed.data.name;
    updates.slug = slugify(parsed.data.name);
  }
  if (parsed.data.country !== undefined) {
    updates.country = parsed.data.country;
  }
  if (parsed.data.atsType !== undefined) {
    updates.ats_type = parsed.data.atsType;
  }
  if (parsed.data.atsIdentifier !== undefined) {
    updates.ats_identifier = parsed.data.atsIdentifier;
  }
  if (parsed.data.careersUrl !== undefined) {
    updates.careers_url = parsed.data.careersUrl || null;
  }
  if (parsed.data.isActive !== undefined) {
    updates.is_active = parsed.data.isActive;
  }
  if (parsed.data.thesis !== undefined) {
    updates.thesis = parsed.data.thesis;
  }
  if (parsed.data.thesisSub !== undefined) {
    updates.thesis_sub = parsed.data.thesisSub;
  }
  if (parsed.data.interpretation !== undefined) {
    updates.interpretation = parsed.data.interpretation;
  }
  if (parsed.data.lastChange !== undefined) {
    updates.last_change = parsed.data.lastChange;
  }
  if (parsed.data.lastChangeAt !== undefined) {
    updates.last_change_at = parsed.data.lastChangeAt;
  }
  if (parsed.data.bets !== undefined) {
    updates.bets = parsed.data.bets;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("companies")
    .update(updates)
    .eq("id", id)
    .select("id, slug")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }
  if (!["editor", "admin"].includes(profile.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify company belongs to user's organization
  const { data: existingCompany } = await supabase
    .from("companies")
    .select("id, organization_id")
    .eq("id", id)
    .single();

  if (!existingCompany) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }
  if (existingCompany.organization_id !== profile.organization_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Soft delete: set is_active to false instead of hard deleting
  const { error } = await supabase
    .from("companies")
    .update({ is_active: false })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
