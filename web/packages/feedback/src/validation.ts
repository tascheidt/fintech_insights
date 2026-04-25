import { z } from "zod";
import type { FeedbackType } from "./types";

/** Build a Zod schema for feedback submission based on configured types */
export function createFeedbackSchema(feedbackTypes: FeedbackType[]) {
  const typeValues = feedbackTypes.map((t) => t.value);

  return z.object({
    type: z.enum(typeValues as [string, ...string[]]),
    title: z.string().min(3, "Title must be at least 3 characters").max(200),
    description: z
      .string()
      .min(10, "Description must be at least 10 characters")
      .max(5000),
    pageUrl: z.string().optional(),
  });
}

/** Zod schema for admin PATCH actions */
export const adminPatchSchema = z.object({
  id: z.string().uuid(),
  admin_override_decision: z.enum(["accepted", "declined"]).optional(),
  admin_notes: z.string().max(2000).optional(),
});
