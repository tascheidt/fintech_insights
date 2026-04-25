import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth/guards";
import { detectATSFromUrl, fetchJobs, SUPPORTED_ATS } from "@/lib/scrapers";

const bodySchema = z.object({
  url: z.string().min(1),
});

export async function POST(req: Request) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "URL is required", issues: parsed.error.issues },
      { status: 400 }
    );
  }
  const { url } = parsed.data;

  // Detect ATS from URL
  const detection = detectATSFromUrl(url);

  if (!detection.detected || !detection.atsType || !detection.atsIdentifier) {
    return NextResponse.json({
      detected: false,
      message: "Could not automatically detect ATS platform from this URL. Please select manually.",
      supportedPlatforms: SUPPORTED_ATS.filter(a => a.implemented).map(a => a.label),
    });
  }

  // Check if the ATS type is implemented
  const atsInfo = SUPPORTED_ATS.find(a => a.value === detection.atsType);
  if (!atsInfo?.implemented) {
    return NextResponse.json({
      detected: true,
      atsType: detection.atsType,
      atsIdentifier: detection.atsIdentifier,
      normalizedUrl: detection.normalizedUrl,
      implemented: false,
      message: `Detected ${atsInfo?.label ?? detection.atsType} but scraper is not yet implemented. You can still add the company for tracking.`,
    });
  }

  // Try to verify by fetching jobs (pass the URL for browser-based scraping)
  let jobCount = 0;
  let verified = false;
  let verifyError: string | null = null;

  try {
    const jobs = await fetchJobs(detection.atsType, detection.atsIdentifier, detection.normalizedUrl);
    jobCount = jobs.length;
    verified = true;
  } catch (e) {
    verifyError = e instanceof Error ? e.message : "Failed to verify connection";
  }

  return NextResponse.json({
    detected: true,
    atsType: detection.atsType,
    atsIdentifier: detection.atsIdentifier,
    atsLabel: atsInfo.label,
    normalizedUrl: detection.normalizedUrl,
    implemented: true,
    verified,
    jobCount: verified ? jobCount : undefined,
    verifyError: verifyError,
    confidence: detection.confidence,
  });
}
