import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

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
    "bamboohr",
    "jazzhr",
    "recruitee",
    "custom",
  ]).optional(),
  atsIdentifier: z.string().min(1).optional(),
  trackForStrategy: z.boolean().optional(),
  careersUrl: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  if (parsed.data.trackForStrategy !== undefined) {
    updates.track_for_strategy = parsed.data.trackForStrategy;
  }
  if (parsed.data.careersUrl !== undefined) {
    updates.careers_url = parsed.data.careersUrl || null;
  }
  if (parsed.data.isActive !== undefined) {
    updates.is_active = parsed.data.isActive;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: "No organization" }, { status: 403 });
  }
  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Only admins can delete companies" }, { status: 403 });
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

  const { error } = await supabase
    .from("companies")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
