import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import { format, subDays } from "date-fns";

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const since = subDays(new Date(), 7).toISOString();

  const [
    { count: activeJobs },
    { count: newJobs },
    { data: insights },
  ] = await Promise.all([
    supabase.from("job_postings").select("*", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("job_postings").select("*", { count: "exact", head: true }).gte("first_seen_date", since),
    supabase.from("strategic_insights").select("id, category, insight_summary, run_date, job_postings!job_posting_id(title, companies(name))").gte("run_date", since).order("run_date", { ascending: false }).limit(10),
  ]);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://your-app.vercel.app";
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Fintech Intelligence Report</title></head>
<body style="font-family:sans-serif;line-height:1.6;color:#333;padding:20px;max-width:600px;margin:0 auto">
  <h1 style="color:#1a1a2e">Fintech Competitive Intelligence Report</h1>
  <p style="color:#666">${format(new Date(), "MMMM d, yyyy")}</p>
  <div style="display:flex;gap:20px;margin:20px 0;flex-wrap:wrap">
    <div><strong style="font-size:1.5em;color:#4a69bd">${activeJobs ?? 0}</strong><br><span style="font-size:0.9em;color:#666">Active Jobs</span></div>
    <div><strong style="font-size:1.5em;color:#4a69bd">${newJobs ?? 0}</strong><br><span style="font-size:0.9em;color:#666">New This Week</span></div>
    <div><strong style="font-size:1.5em;color:#4a69bd">${(insights ?? []).length}</strong><br><span style="font-size:0.9em;color:#666">Insights</span></div>
  </div>
  <h2 style="margin-top:24px">Recent Insights</h2>
  <ul style="list-style:none;padding:0">
    ${(insights ?? []).map((i) => {
    const jpRaw = i.job_postings;
    const jp = Array.isArray(jpRaw) ? jpRaw[0] : jpRaw;
    const co = Array.isArray((jp as { companies?: unknown })?.companies) ? ((jp as { companies?: { name?: string }[] })?.companies?.[0]) : ((jp as { companies?: { name?: string } })?.companies);
    return `
    <li style="padding:8px 0;border-bottom:1px solid #eee">
      <strong>${co?.name ?? "—"} | ${(jp as { title?: string })?.title ?? "—"}</strong><br>
      <span style="color:#666;font-size:0.9em">${(i.insight_summary ?? "").slice(0, 200)}…</span>
    </li>`;
  }).join("")}
  </ul>
  ${(insights ?? []).length === 0 ? "<p style='color:#666'>No new insights this week.</p>" : ""}
  <p style="margin-top:24px"><a href="${appUrl}" style="color:#4a69bd">View full dashboard →</a></p>
</body></html>`;

  const to = process.env.REPORT_EMAIL;
  const from = process.env.RESEND_FROM || "onboarding@resend.dev";
  const resendKey = process.env.RESEND_API_KEY;

  if (resendKey && to) {
    try {
      const resend = new Resend(resendKey);
      await resend.emails.send({ from, to, subject: `Fintech Intelligence Report – ${format(new Date(), "MMM d, yyyy")}`, html });
      return NextResponse.json({ success: true, sent: true });
    } catch (e) {
      console.error("Resend error:", e);
      return NextResponse.json({ success: false, error: "Failed to send email" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true, sent: false });
}
