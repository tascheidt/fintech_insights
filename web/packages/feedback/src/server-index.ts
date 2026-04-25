// Route handler factories
export { createFeedbackHandlers } from "./routes/feedback";
export { createAdminFeedbackHandlers } from "./routes/admin-feedback";
export { createCodeGenHandler } from "./routes/admin-feedback-generate";

// Services (for direct use if needed)
export { createGitHubIssue, triggerCodeGenWorkflow } from "./services/github";
export { notifyAdminsOfNewFeedback } from "./services/email";
export { FeedbackNotificationEmail } from "./services/email-template";
export { getResendError } from "./services/resend-result";

// Config & validation
export { resolveConfig } from "./config";
export { createFeedbackSchema, adminPatchSchema } from "./validation";
export { defaultGetUser, createDefaultIsAdmin } from "./auth-defaults";

// Types
export type {
  FeedbackConfig,
  ResolvedFeedbackConfig,
  FeedbackItem,
  FeedbackSubmission,
  FeedbackType,
  GitHubConfig,
  EmailConfig,
} from "./types";
