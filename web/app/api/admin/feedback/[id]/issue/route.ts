import { createIssueHandler } from "@tascheidt/feedback";
import { feedbackConfig } from "@/lib/feedback-config";

export const { POST } = createIssueHandler(feedbackConfig);
