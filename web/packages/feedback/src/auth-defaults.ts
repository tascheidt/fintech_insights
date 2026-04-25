import type { SupabaseClient } from "@supabase/supabase-js";

/** Default getUser implementation using Supabase auth */
export async function defaultGetUser(
  supabase: SupabaseClient
): Promise<{ id: string; email?: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? undefined };
}

/**
 * Create a default isAdmin checker that queries a user/profiles table.
 * Returns a function that checks if user has the admin role value.
 */
export function createDefaultIsAdmin(
  userTable: string,
  userRoleColumn: string,
  adminRoleValue: string
) {
  return async (supabase: SupabaseClient, userId: string): Promise<boolean> => {
    const { data } = await supabase
      .from(userTable)
      .select(userRoleColumn)
      .eq("id", userId)
      .single();
    const record = data as Record<string, unknown> | null;
    return record?.[userRoleColumn] === adminRoleValue;
  };
}
