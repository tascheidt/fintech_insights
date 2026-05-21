/**
 * Tests for the pure-logic pieces of the Phenom-RBC scraper.
 *
 * The Puppeteer driver (pagination loop, description enrichment with
 * concurrency=4) requires a real browser and is exercised by the smoke
 * script under `web/scripts/smoke-phenom-rbc.ts`. The tests here cover
 * the parts that don't need a browser: HTML payload extraction, the
 * Phenom-row → JobData mapper, and HTML-entity decoding.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeHtmlEntities,
  extractEagerLoadPayload,
  mapPhenomJob,
  resolveJobCap,
  type PhenomRawJob,
  type PhenomSearchPayload,
} from "./phenom-rbc";

const FIXTURE_PATH = resolve(__dirname, "__fixtures__/phenom-rbc-listing.json");
const FIXTURE: PhenomSearchPayload = JSON.parse(
  readFileSync(FIXTURE_PATH, "utf8")
);

describe("extractEagerLoadPayload", () => {
  it("returns null when the marker is missing", () => {
    expect(extractEagerLoadPayload("<html><body>nothing here</body></html>")).toBeNull();
  });

  it("returns null when the JSON object is malformed", () => {
    // Truncated object — brace counter walks off the end.
    const html = `<script>var x = "eagerLoadRefineSearch":{"status":200,</script>`;
    expect(extractEagerLoadPayload(html)).toBeNull();
  });

  it("extracts the embedded payload from a representative HTML chunk", () => {
    // Wrap the fixture in a minimal HTML scaffolding that mirrors Phenom's
    // actual rendered structure. The extractor must walk past the leading
    // chrome and return the eagerLoadRefineSearch object intact.
    const wrapped = `<!DOCTYPE html><html><body><script>
      var phApp = phApp || {};
      phApp.ddo = { "flashParams": {}, "eagerLoadRefineSearch": ${JSON.stringify(FIXTURE)} };
    </script></body></html>`;

    const got = extractEagerLoadPayload(wrapped);
    expect(got).not.toBeNull();
    expect(got!.totalHits).toBe(FIXTURE.totalHits);
    expect(got!.data?.jobs?.length).toBe(FIXTURE.data?.jobs?.length);
  });

  it("does not confuse braces inside string literals for object boundaries", () => {
    // A `}` inside a quoted string should NOT close the outer object.
    const wrapped = `garbage "eagerLoadRefineSearch":{"trick":"this has a } in it","status":200,"data":{"jobs":[]}}`;
    const got = extractEagerLoadPayload(wrapped);
    expect(got).not.toBeNull();
    // The parser must walk past the `}` inside the "trick" string and
    // close on the OUTER object's closing brace.
    expect(got!.data?.jobs).toEqual([]);
  });
});

describe("decodeHtmlEntities", () => {
  it("decodes the entity set Phenom uses in JSON-LD descriptions", () => {
    const encoded =
      "&lt;div&gt;Hello &amp; goodbye &quot;world&quot; with &nbsp; spaces and &#39;apostrophes&#39;&lt;/div&gt;";
    const decoded = decodeHtmlEntities(encoded);
    expect(decoded).toBe(
      "<div>Hello & goodbye \"world\" with   spaces and 'apostrophes'</div>"
    );
  });

  it("decodes &amp; LAST so doubled-encoded sequences don't re-encode", () => {
    // The encoded form `&amp;lt;` should decode to `&lt;` (a literal &lt;),
    // not get pre-decoded to `<` by an out-of-order &lt; pass.
    expect(decodeHtmlEntities("&amp;lt;")).toBe("&lt;");
  });
});

describe("mapPhenomJob", () => {
  it("maps a research-engineer fixture row to a complete JobData", () => {
    const research = FIXTURE.data!.jobs!.find(
      (j) => j.reqId === "R-0000153556"
    );
    expect(research).toBeDefined();

    const job = mapPhenomJob(research as PhenomRawJob);
    expect(job.external_id).toBe("R-0000153556");
    expect(job.title).toBe("Research Engineer");
    expect(job.department).toBe("Technology | Analytics | Research");
    expect(job.team).toBe("Research");
    expect(job.location).toBe("MONTRÉAL, Quebec, Canada");
    expect(job.url).toBe(
      "https://jobs.rbc.com/ca/en/job/R-0000153556/Research-Engineer"
    );
    expect(job.description_text).toMatch(/RBC Borealis/);
    expect(job.description_html).toBeNull(); // populated by enrichment, not the mapper
    expect(job.commitment).toBe("full-time");
    expect(job.posted_date?.toISOString()).toBe("2026-02-12T00:00:00.000Z");
  });

  it("derives team from subCategory (not duplicated from department)", () => {
    const risk = FIXTURE.data!.jobs!.find((j) => j.reqId === "R-0000040439");
    const job = mapPhenomJob(risk as PhenomRawJob);
    expect(job.department).toBe("Audit | Compliance | Legal | Risk");
    expect(job.team).toBe("Enterprise and Financial Risk");
    expect(job.team).not.toBe(job.department); // regression: was duplicating title before
  });

  it("handles missing reqId by falling back to jobUrl/applyUrl", () => {
    const raw: PhenomRawJob = {
      title: "Foo",
      jobUrl: "https://jobs.rbc.com/ca/en/job/FOO-1/Foo",
    };
    const job = mapPhenomJob(raw);
    expect(job.external_id).toBe("");
    expect(job.url).toBe("https://jobs.rbc.com/ca/en/job/FOO-1/Foo");
  });

  it("infers commitment from the type field when present", () => {
    expect(mapPhenomJob({ title: "X", type: "Contract" }).commitment).toBe("contract");
    expect(mapPhenomJob({ title: "X", type: "Internship" }).commitment).toBe("internship");
    expect(mapPhenomJob({ title: "X", type: "Part time" }).commitment).toBe("part-time");
    expect(mapPhenomJob({ title: "X", type: "Full time" }).commitment).toBe("full-time");
    expect(mapPhenomJob({ title: "X" }).commitment).toBe("full-time"); // default
  });

  it("respects explicit remote/hybrid flags before falling back to text heuristics", () => {
    expect(mapPhenomJob({ title: "X", remote: true }).location_type).toBe("remote");
    expect(mapPhenomJob({ title: "X", hybrid: "true" }).location_type).toBe("hybrid");
  });

  it("produces a valid Phenom URL even when applyUrl points into Workday", () => {
    // RBC's applyUrl routes into rbc.wd3.myworkdayjobs.com — we ignore it
    // and synthesize the Phenom-facing /ca/en/job/<id>/<slug> URL.
    const raw: PhenomRawJob = {
      reqId: "R-X",
      title: "Cloud MLOps & GenAI Lead",
      applyUrl:
        "https://rbc.wd3.myworkdayjobs.com/RBCGLOBAL1/job/whatever/apply",
    };
    const job = mapPhenomJob(raw);
    expect(job.url).toBe(
      "https://jobs.rbc.com/ca/en/job/R-X/Cloud-MLOps-GenAI-Lead"
    );
    expect(job.url).not.toContain("workday");
  });

  it("aggregates multi_location into the canonical city/state/country string", () => {
    const sales = FIXTURE.data!.jobs!.find((j) => j.reqId === "R-0000170325");
    const job = mapPhenomJob(sales as PhenomRawJob);
    expect(job.location).toBe("WINNIPEG, Manitoba, Canada");
  });
});

describe("resolveJobCap", () => {
  it("returns null when unset — production default is the FULL corpus", () => {
    expect(resolveJobCap(undefined)).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(resolveJobCap("")).toBeNull();
  });

  it("returns null for a non-numeric value rather than throwing", () => {
    expect(resolveJobCap("all")).toBeNull();
    expect(resolveJobCap("50x")).toBeNull();
  });

  it("parses a positive integer cap (smoke tests / cost ceilings)", () => {
    expect(resolveJobCap("5")).toBe(5);
    expect(resolveJobCap("1500")).toBe(1500);
  });

  it("clamps a zero cap up to 1 — a cap of 0 would be a useless run", () => {
    expect(resolveJobCap("0")).toBe(1);
  });
});

describe("fixture sanity", () => {
  it("contains the three reference jobs the tests depend on", () => {
    const ids = FIXTURE.data?.jobs?.map((j) => j.reqId);
    expect(ids).toEqual(
      expect.arrayContaining(["R-0000153556", "R-0000040439", "R-0000170325"])
    );
  });
});
