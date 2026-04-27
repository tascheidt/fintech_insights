import "server-only";

import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export interface AdminProfile {
  role: string | null;
}

export async function getAuthContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: AdminProfile | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    profile = data;
  }

  return { supabase, user, profile };
}

export async function requireAdminApi() {
  const context = await getAuthContext();

  if (!context.user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (context.profile?.role !== "admin") {
    return {
      error: NextResponse.json({ error: "Admin access required" }, { status: 403 }),
    };
  }

  return {
    ...context,
    user: context.user as User,
    profile: context.profile,
  };
}

export async function requireAdminPage() {
  const context = await getAuthContext();

  if (!context.user) {
    redirect("/login");
  }

  if (context.profile?.role !== "admin") {
    redirect("/dashboard");
  }

  return {
    ...context,
    user: context.user as User,
    profile: context.profile,
  };
}
