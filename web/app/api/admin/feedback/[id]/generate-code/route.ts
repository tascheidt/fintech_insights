import { createCodeGenHandler } from "@tascheidt/feedback";
import { feedbackConfig } from "@/lib/feedback-config";

export const { POST } = createCodeGenHandler(feedbackConfig);
