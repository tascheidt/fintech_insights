// Types & config
export { resolveConfig } from "./config";
export {
  DEFAULT_FEEDBACK_TYPES,
  type FeedbackConfig,
  type FeedbackItem,
  type FeedbackSubmission,
  type FeedbackType,
  type GitHubConfig,
  type EmailConfig,
  type FeedbackLogger,
  type RateLimitConfig,
  type ResolvedFeedbackConfig,
} from "./types";

// Route handler factories
export { createFeedbackHandlers } from "./routes/feedback";
export { createAdminFeedbackHandlers } from "./routes/admin-feedback";
export { createCodeGenHandler } from "./routes/admin-feedback-generate";
export { createIssueHandler } from "./routes/admin-feedback-issue";

// Services (for direct use if needed)
export { createGitHubIssue, triggerCodeGenWorkflow } from "./services/github";
export { notifyAdminsOfNewFeedback } from "./services/email";
export { FeedbackNotificationEmail } from "./services/email-template";
export { getResendError } from "./services/resend-result";

// Config & validation
export {
  createFeedbackSchema,
  adminPatchSchema,
  reviewStateFromLegacyDecision,
  REVIEW_STATES,
  type ReviewState,
} from "./validation";
export { defaultGetUser, createDefaultIsAdmin } from "./auth-defaults";
