import type { JobData } from "./types";
import { htmlToText, detectLocationType, normalizeCommitment } from "./utils";

const BASE = "https://api.lever.co/v0/postings";

export async function fetchLeverJobs(atsIdentifier: string): Promise<JobData[]> {
  const res = await fetch(`${BASE}/${atsIdentifier}?mode=json`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Lever API error: ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>[];

  const jobs: JobData[] = [];
  for (const job of data) {
    const j = job as Record<string, unknown>;
    const cat = (j.categories as Record<string, unknown>) ?? {};
    const loc = cat.location;
    const location = Array.isArray(loc) ? (loc as string[]).join(", ") : (loc as string) ?? "";

    let descriptionHtml = (j.descriptionPlain as string) ?? "";
    const lists = (j.lists as { text?: string; content?: string }[]) ?? [];
    for (const lst of lists) {
      if (lst.text && lst.content) descriptionHtml += `\n\n## ${lst.text}\n${lst.content}`;
    }
    const add = j.additional as string;
    if (add) descriptionHtml += `\n\n${add}`;

    let postedDate: Date | null = null;
    const created = j.createdAt as number | undefined;
    if (created) {
      try {
        postedDate = new Date(created);
      } catch {}
    }

    jobs.push({
      external_id: String(j.id ?? ""),
      title: String(j.text ?? ""),
      department: (cat.department as string) ?? null,
      team: (cat.team as string) ?? null,
      location: location || null,
      location_type: detectLocationType(location, descriptionHtml),
      description_html: descriptionHtml || null,
      description_text: htmlToText(descriptionHtml),
      commitment: normalizeCommitment((cat.commitment as string) ?? ""),
      posted_date: postedDate,
      url: (j.hostedUrl as string) || (j.applyUrl as string) || null,
    });
  }
  return jobs;
}
