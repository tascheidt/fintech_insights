/** Read-only source check: no database, ingest, Gemini, or email calls. */
import { mkdir, writeFile } from "node:fs/promises";
import { fetchWorkdayCibcJobs } from "../lib/scrapers/workday-cibc";

async function main() {
  const originalFetch = globalThis.fetch;
  let readerPages = 0;
  const artifactDir = "scripts/artifacts/cibc-live";
  await mkdir(artifactDir, { recursive: true });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    // Exercise the blocked-runner path even when the origin allows this IP.
    if (url.startsWith("https://cibc.wd3.myworkdayjobs.com/wday/cxs/")) {
      return new Response('<!DOCTYPE html><html><head><title>Akamai challenge</title></head></html>', {
        status: 200,
        headers: { "Content-Type": "text/html" },
      });
    }
    const response = await originalFetch(input, init);
    if (url.startsWith("https://r.jina.ai/")) {
      const body = await response.clone().text();
      await writeFile(`${artifactDir}/reader-${++readerPages}.json`, body);
      console.log("Reader response", { url, status: response.status, bytes: body.length });
    }
    return response;
  };
  
  try {
    const jobs = await fetchWorkdayCibcJobs({ simpliiOnly: true });
    const simplii = jobs.filter(job => job.companySlugOverride === "simplii");
    if (!jobs.length || !simplii.length || jobs.some(job => !job.description_text?.trim())) {
      throw new Error("Live check requires candidates, Simplii matches, and every description");
    }
    const summary = {
      checkedAt: new Date().toISOString(),
      candidates: jobs.length,
      descriptions: jobs.filter(job => job.description_text?.trim()).length,
      simplii: simplii.map(job => ({ id: job.external_id, title: job.title })),
      readerPages,
    };
    console.log(JSON.stringify(summary, null, 2));
    await writeFile(`${artifactDir}/summary.json`, JSON.stringify(summary, null, 2));
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
