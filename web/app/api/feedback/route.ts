import { createFeedbackHandlers } from "@tascheidt/feedback";
import { feedbackConfig } from "@/lib/feedback-config";

export const { POST, GET } = createFeedbackHandlers(feedbackConfig);
