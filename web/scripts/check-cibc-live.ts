/** Read-only source check: no database, ingest, Gemini, or email calls. */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { fetchWorkdayCibcJobs } from "../lib/scrapers/workday-cibc";

async function main() {
  const originalFetch = globalThis.fetch;
  let readerPages = 0;
  const injectIncomplete = process.argv.includes("--incomplete-first");
  const incompleteOnly = process.argv.includes("--incomplete-only");
  let injectedIncomplete = false;
  const artifactDir = "scripts/artifacts/cibc-live";
  await rm(artifactDir, { recursive: true, force: true });
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
    let response: Response;
    if ((incompleteOnly || (injectIncomplete && !injectedIncomplete)) &&
        url.startsWith("https://r.jina.ai/")) {
      injectedIncomplete = true;
      response = Response.json({ data: {
        url: url.slice("https://r.jina.ai/".length),
        httpStatus: 200,
        text: "Search for Jobs page is loaded",
        links: [],
      } });
    } else {
      response = await originalFetch(input, init);
    }
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
      injectedIncomplete,
    };
    console.log(JSON.stringify(summary, null, 2));
    await writeFile(`${artifactDir}/summary.json`, JSON.stringify(summary, null, 2));
  } catch (error) {
    await writeFile(`${artifactDir}/failure.json`, JSON.stringify({
      checkedAt: new Date().toISOString(), readerPages, injectedIncomplete,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    throw error;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
