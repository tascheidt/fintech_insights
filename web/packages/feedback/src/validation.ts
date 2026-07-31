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
    // Client sends `usePathname()`, so this is an in-app path, not a URL.
    // Bounded to match the DB constraint (feedback_page_url_len, 500 chars)
    // and shape-checked so a direct API caller cannot stash arbitrary text —
    // it is rendered back in the admin review table.
    pageUrl: z
      .string()
      .max(500)
      .regex(/^\//, "pageUrl must be an app-relative path")
      .optional(),
  });
}

/** Zod schema for admin PATCH actions */
export const adminPatchSchema = z.object({
  id: z.string().uuid(),
  admin_override_decision: z.enum(["accepted", "declined"]).optional(),
  admin_notes: z.string().max(2000).optional(),
});
