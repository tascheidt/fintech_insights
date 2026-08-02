import type { SupabaseClient } from "@supabase/supabase-js";

/** A feedback type option shown in the submission form */
export interface FeedbackType {
  value: string;
  label: string;
  titlePlaceholder?: string;
}

/** Default feedback types */
export const DEFAULT_FEEDBACK_TYPES: FeedbackType[] = [
  { value: "feature", label: "Feature request", titlePlaceholder: "What new capability would help you most?" },
  { value: "bug", label: "Bug report", titlePlaceholder: "Describe what happened and what you expected." },
  { value: "improvement", label: "Improvement", titlePlaceholder: "What could work better?" },
  { value: "general", label: "General", titlePlaceholder: "What\u2019s on your mind?" },
];

/** A user's feedback submission (returned by GET /api/feedback) */
export interface FeedbackItem {
  id: string;
  type: string;
  title: string;
  description: string;
  status: string;
  triage_decision: string | null;
  triage_confidence: number | null;
  triage_reasoning: string | null;
  triage_suggested_title: string | null;
  created_at: string;
}

/** Full feedback record with admin/triage fields (returned by admin endpoints) */
export interface FeedbackSubmission {
  id: string;
  type: string;
  title: string;
  description: string;
  page_url: string | null;
  status: string;
  triage_decision: string | null;
  triage_confidence: number | null;
  triage_reasoning: string | null;
  triage_mapped_priority: string | null;
  triage_duplicate_of: string | null;
  triage_suggested_title: string | null;
  triage_suggested_labels: string[] | null;
  triage_completed_at: string | null;
  generated_issue: string | null;
  admin_override_decision: string | null;
  admin_notes: string | null;
  reviewed_at: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  created_at: string;
  updated_at: string;
  profiles: { email: string } | null;
}

/** GitHub integration config */
export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  codeGenWorkflowFile?: string;
}

/** Email integration config */
export interface EmailConfig {
  resendApiKey: string;
  fromAddress: string;
  adminPanelPath?: string;
}

/** Main configuration for the feedback module */
export interface FeedbackConfig {
  /** Application name used in emails and UI copy */
  appName: string;
  /** Application URL (used in emails) */
  appUrl: string;
  /** Feedback type options (defaults to feature/bug/improvement/general) */
  feedbackTypes?: FeedbackType[];
  /** API base path for user feedback endpoints (default: "/api/feedback") */
  apiBasePath?: string;
  /** API base path for admin feedback endpoints (default: "/api/admin/feedback") */
  adminApiBasePath?: string;

  /** Factory returning a Supabase client with the current user's session */
  createServerClient: () => Promise<SupabaseClient>;
  /** Factory returning a Supabase admin client (bypasses RLS) */
  createAdminClient: () => SupabaseClient;

  /** Resolve the current user from a Supabase client. Defaults to supabase.auth.getUser(). */
  getUser?: (supabase: SupabaseClient) => Promise<{ id: string; email?: string } | null>;
  /** Check if a user is an admin. Defaults to checking profiles.role === adminRoleValue. */
  isAdmin?: (supabase: SupabaseClient, userId: string) => Promise<boolean>;

  /** Name of the user/profiles table (default: "profiles") */
  userTable?: string;
  /** Column containing user email (default: "email") */
  userEmailColumn?: string;
  /** Column containing user role (default: "role") */
  userRoleColumn?: string;
  /** FK constraint name linking feedback_submissions.user_id to the user table */
  userForeignKey?: string;
  /** Role value that identifies admins (default: "admin") */
  adminRoleValue?: string;

  /** GitHub integration (issue creation + code gen workflow) */
  github?: GitHubConfig;
  /** Email notification integration */
  email?: EmailConfig;

  /**
   * Called fire-and-forget after a submission is persisted, so the host app can
   * kick off downstream work (AI triage, analytics) without this package taking
   * a dependency on it. Errors are swallowed — the user's submission has already
   * succeeded by this point and must not fail because a follow-up did.
   */
  onSubmissionCreated?: (submission: {
    id: string;
    type: string;
    title: string;
    description: string;
    pageUrl: string | null;
    userId: string;
  }) => void | Promise<void>;
}

/** Resolved config with all defaults applied */
export type ResolvedFeedbackConfig = Required<
  Pick<FeedbackConfig, "appName" | "appUrl" | "feedbackTypes" | "apiBasePath" | "adminApiBasePath" | "createServerClient" | "createAdminClient" | "getUser" | "isAdmin" | "userTable" | "userEmailColumn" | "userRoleColumn" | "userForeignKey" | "adminRoleValue">
> & Pick<FeedbackConfig, "github" | "email" | "onSubmissionCreated">;
