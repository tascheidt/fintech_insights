import type { JobData } from "./types";
import { htmlToText, normalizeCommitment } from "./utils";

const BASE = "https://apply.workable.com/api/v3/accounts";

function mapWorktype(worktype: string): string | null {
  if (!worktype) return null;
  const w = worktype.toLowerCase();
  if (/remote/.test(w)) return "remote";
  if (/hybrid/.test(w)) return "hybrid";
  if (/on-site|onsite/.test(w)) return "onsite";
  return null;
}

export async function fetchWorkableJobs(atsIdentifier: string): Promise<JobData[]> {
  const all: JobData[] = [];
  let token: string | undefined;

  const fetchPage = async (next?: string) => {
    const payload: Record<string, unknown> = { query: "", location: [], department: [], worktype: [] };
    if (next) payload.token = next;

    const res = await fetch(`${BASE}/${atsIdentifier}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) throw new Error(`Workable API error: ${res.status}`);
    return (await res.json()) as { results?: Record<string, unknown>[]; paging?: { next?: string } };
  };

  while (true) {
    const data = await fetchPage(token);
    const results = data.results ?? [];
    for (const job of results) {
      const j = job as Record<string, unknown>;
      const loc = j.location as Record<string, string> | undefined;
      let location = "";
      if (loc && typeof loc === "object") {
        const parts = [loc.city, loc.country].filter(Boolean);
        location = parts.join(", ");
      } else if (loc) location = String(loc);

      const worktype = (j.worktype as string) ?? "";
      const locationType = mapWorktype(worktype);

      let dept = j.department;
      if (Array.isArray(dept)) dept = dept[0];
      const department = (dept as string) ?? "";

      const descriptionHtml = (j.description as string) ?? "";
      const shortcode = (j.shortcode as string) ?? "";

      let postedDate: Date | null = null;
      const pub = j.published_on as string | undefined;
      if (pub) {
        try {
          postedDate = new Date(pub.replace("Z", "+00:00"));
        } catch {}
      }

      const url = shortcode ? `https://apply.workable.com/${atsIdentifier}/j/${shortcode}/` : "";

      let commitment = normalizeCommitment((j.employment_type as string) ?? "") ?? "full-time";
      const title = ((j.title as string) ?? "").toLowerCase();
      if (/intern/.test(title)) commitment = "internship";
      else if (/contract/.test(title)) commitment = "contract";

      all.push({
        external_id: shortcode || String(j.id ?? ""),
        title: String(j.title ?? ""),
        department: department || null,
        team: null,
        location: location || null,
        location_type: locationType,
        description_html: descriptionHtml || null,
        description_text: htmlToText(descriptionHtml),
        commitment: commitment || null,
        posted_date: postedDate,
        url: url || null,
      });
    }

    token = data.paging?.next;
    if (!token) break;
  }

  return all;
}
