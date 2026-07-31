import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_FEEDBACK_TYPES,
  type FeedbackConfig,
  type ResolvedFeedbackConfig,
} from "./types";

async function defaultGetUser(
  supabase: SupabaseClient
): Promise<{ id: string; email?: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email ?? undefined };
}

function defaultIsAdmin(
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

/** Apply defaults to a partial config, returning a fully resolved config. */
export function resolveConfig(config: FeedbackConfig): ResolvedFeedbackConfig {
  const userTable = config.userTable ?? "profiles";
  const userRoleColumn = config.userRoleColumn ?? "role";
  const adminRoleValue = config.adminRoleValue ?? "admin";

  return {
    appName: config.appName,
    appUrl: config.appUrl,
    feedbackTypes: config.feedbackTypes ?? DEFAULT_FEEDBACK_TYPES,
    apiBasePath: config.apiBasePath ?? "/api/feedback",
    adminApiBasePath: config.adminApiBasePath ?? "/api/admin/feedback",
    createServerClient: config.createServerClient,
    createAdminClient: config.createAdminClient,
    getUser: config.getUser ?? defaultGetUser,
    isAdmin:
      config.isAdmin ?? defaultIsAdmin(userTable, userRoleColumn, adminRoleValue),
    userTable,
    userEmailColumn: config.userEmailColumn ?? "email",
    userRoleColumn,
    userForeignKey:
      config.userForeignKey ?? "feedback_submissions_user_id_fkey",
    adminRoleValue,
    github: config.github,
    email: config.email,
    onSubmissionCreated: config.onSubmissionCreated,
    rateLimit: config.rateLimit,
    logger: config.logger ?? console,
  };
}
