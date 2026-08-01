/**
 * PATCH /api/reports/[id] — edit the parts of a report the sender controls.
 *
 * Only the title and the commentary are mutable. The snapshot, the search
 * context, and the synthesis are the artifact: letting them be rewritten after
 * a link has been sent would mean a recipient's URL silently changes content.
 *
 * Ownership is enforced in the query (`created_by = user.id`), not by RLS —
 * the store uses the service-role client. A non-owner gets a 404, not a 403,
 * so report ids aren't probeable.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { updateOwnedReport } from "@/lib/reports/store";
import { buildReportUrl } from "@/lib/reports/types";
import { getEmailBaseUrl } from "@/lib/email/links";

const PatchSchema = z
  .object({
    title: z.string().min(1).max(160).optional(),
    commentary: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => v.title !== undefined || v.commentary !== undefined, {
    message: "Nothing to update",
  });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const patch: { title?: string; commentary?: string | null } = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title.trim();
  if (parsed.data.commentary !== undefined) {
    patch.commentary = parsed.data.commentary?.trim() || null;
  }

  const report = await updateOwnedReport(id, user.id, patch);
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  return NextResponse.json({
    report,
    url: buildReportUrl(report.shareToken, getEmailBaseUrl()),
  });
}
