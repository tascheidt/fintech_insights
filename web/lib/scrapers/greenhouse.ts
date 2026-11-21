import type { JobData } from "./types";
import { htmlToText, detectLocationType, normalizeCommitment, decodeHtmlEntities } from "./utils";

const BASE = "https://boards-api.greenhouse.io/v1/boards";

/**
 * Greenhouse's Job Board API returns `content` HTML-entity-escaped
 * (`&lt;div class=&quot;content-intro&quot;&gt;…`). Passed straight to
 * `htmlToText`, there are no real tags to strip, so the entities decode into
 * literal markup and `description_text` starts with `<div class="…"><p>…`
 * (seen on Questrade's board, Nov 2026). Decode once when the payload is
 * escaped; leave real HTML untouched so a literal `&lt;` in prose survives.
 */
export function decodeGreenhouseContent(content: string): string {
  if (!content) return "";
  const looksEscaped = content.includes("&lt;") && !/<[a-z!/]/i.test(content);
  return looksEscaped ? decodeHtmlEntities(content) : content;
}

export async function fetchGreenhouseJobs(atsIdentifier: string): Promise<JobData[]> {
  const res = await fetch(`${BASE}/${atsIdentifier}/jobs?content=true`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Greenhouse API error: ${res.status}`);
  const data = (await res.json()) as { jobs?: Record<string, unknown>[] };
  const list = data.jobs ?? [];

  const jobs: JobData[] = [];
  for (const job of list) {
    const j = job as Record<string, unknown>;
    const locData = j.location as Record<string, unknown> | undefined;
    const location = locData && typeof locData === "object" ? (locData.name as string) ?? "" : String(locData ?? "");

    const depts = (j.departments as { name?: string }[]) ?? [];
    const department = depts[0]?.name ?? "";

    const offices = (j.offices as { name?: string }[]) ?? [];
    const loc = (location || offices[0]?.name) ?? "";

    const descriptionHtml = decodeGreenhouseContent((j.content as string) ?? "");

    let postedDate: Date | null = null;
    const up = j.updated_at as string | undefined;
    if (up) {
      try {
        postedDate = new Date(up.replace("Z", "+00:00"));
      } catch {}
    }

    let commitment = "full-time";
    const meta = (j.metadata as { name?: string; value?: string }[]) ?? [];
    for (const m of meta) {
      if (m?.name && ["employment type", "commitment", "type"].includes((m.name as string).toLowerCase())) {
        commitment = normalizeCommitment(m.value ?? "") ?? commitment;
        break;
      }
    }
    const title = ((j.title as string) ?? "").toLowerCase();
    if (/intern/.test(title)) commitment = "internship";
    else if (/contract/.test(title)) commitment = "contract";
    else if (/part-time|part time/.test(title)) commitment = "part-time";

    jobs.push({
      external_id: String(j.id ?? ""),
      title: String(j.title ?? ""),
      department: department || null,
      team: null,
      location: loc || null,
      location_type: detectLocationType(loc, descriptionHtml),
      description_html: descriptionHtml || null,
      description_text: htmlToText(descriptionHtml),
      commitment: commitment || null,
      posted_date: postedDate,
      url: (j.absolute_url as string) ?? null,
    });
  }
  return jobs;
}
