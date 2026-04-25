import { createAdminFeedbackHandlers } from "@tascheidt/feedback";
import { feedbackConfig } from "@/lib/feedback-config";

export const { GET, PATCH } = createAdminFeedbackHandlers(feedbackConfig);
