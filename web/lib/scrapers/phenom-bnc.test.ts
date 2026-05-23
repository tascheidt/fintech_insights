/**
 * Tests for the pure-logic pieces of the Phenom-BNC scraper.
 *
 * The Puppeteer driver (pagination loop, description enrichment with
 * concurrency=4) requires a real browser. The tests here cover the parts
 * that don't need a browser: HTML payload extraction, the Phenom-row →
 * JobData mapper, and the env-var cap resolver.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeHtmlEntities,
  extractEagerLoadPayload,
  mapBncJob,
  resolveJobCap,
  type PhenomRawJob,
  type PhenomSearchPayload,
} from "./phenom-bnc";

const FIXTURE_PATH = resolve(__dirname, "__fixtures__/phenom-bnc-listing.json");
const FIXTURE: PhenomSearchPayload = JSON.parse(
  readFileSync(FIXTURE_PATH, "utf8")
);

describe("extractEagerLoadPayload (BNC)", () => {
  it("returns null when the marker is missing", () => {
    expect(extractEagerLoadPayload("<html><body>nothing here</body></html>")).toBeNull();
  });

  it("returns null when the JSON object is malformed", () => {
    const html = `<script>var x = "eagerLoadRefineSearch":{"status":200,</script>`;
    expect(extractEagerLoadPayload(html)).toBeNull();
  });

  it("extracts the embedded payload from a representative HTML chunk", () => {
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
    const wrapped = `garbage "eagerLoadRefineSearch":{"trick":"this has a } in it","status":200,"data":{"jobs":[]}}`;
    const got = extractEagerLoadPayload(wrapped);
    expect(got).not.toBeNull();
    expect(got!.data?.jobs).toEqual([]);
  });
});

describe("decodeHtmlEntities (BNC re-export)", () => {
  it("decodes the entity set Phenom uses in JSON-LD descriptions", () => {
    const encoded =
      "&lt;div&gt;Hello &amp; goodbye &quot;world&quot; with &nbsp; spaces and &#39;apostrophes&#39;&lt;/div&gt;";
    const decoded = decodeHtmlEntities(encoded);
    expect(decoded).toBe(
      "<div>Hello & goodbye \"world\" with   spaces and 'apostrophes'</div>"
    );
  });
});

describe("mapBncJob", () => {
  it("maps the principal cloud engineer fixture row to a complete JobData", () => {
    const cloud = FIXTURE.data!.jobs!.find((j) => j.reqId === "JR-23541");
    expect(cloud).toBeDefined();

    const job = mapBncJob(cloud as PhenomRawJob);
    expect(job.external_id).toBe("JR-23541");
    expect(job.title).toBe("Principal Cloud Engineer");
    expect(job.department).toBe("Technology | Data | Cyber");
    expect(job.team).toBe("Cloud Platform Engineering");
    expect(job.location).toBe("Montréal, Quebec, Canada");
    expect(job.url).toBe(
      "https://emplois.bnc.ca/fr_CA/careers/jobdetail/JR-23541/Principal-Cloud-Engineer"
    );
    expect(job.description_text).toMatch(/Plateforme Infonuagique/);
    expect(job.description_html).toBeNull(); // populated by enrichment, not the mapper
    expect(job.commitment).toBe("full-time");
    expect(job.posted_date?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    // Explicit remote flag from fixture wins over text heuristics.
    expect(job.location_type).toBe("remote");
  });

  it("derives team from subCategory, distinct from department", () => {
    const wealth = FIXTURE.data!.jobs!.find((j) => j.reqId === "JR-23789");
    const job = mapBncJob(wealth as PhenomRawJob);
    expect(job.department).toBe("Wealth Management | Private Banking");
    expect(job.team).toBe("Wealth Management Advisory");
    expect(job.team).not.toBe(job.department);
  });

  it("handles missing reqId by falling back to jobUrl/applyUrl", () => {
    const raw: PhenomRawJob = {
      title: "Foo",
      jobUrl: "https://emplois.bnc.ca/fr_CA/careers/jobdetail/FOO-1/Foo",
    };
    const job = mapBncJob(raw);
    expect(job.external_id).toBe("");
    expect(job.url).toBe("https://emplois.bnc.ca/fr_CA/careers/jobdetail/FOO-1/Foo");
  });

  it("infers commitment from the type field when present", () => {
    expect(mapBncJob({ title: "X", type: "Contract" }).commitment).toBe("contract");
    expect(mapBncJob({ title: "X", type: "Internship" }).commitment).toBe("internship");
    expect(mapBncJob({ title: "X", type: "Part time" }).commitment).toBe("part-time");
    expect(mapBncJob({ title: "X", type: "Full time" }).commitment).toBe("full-time");
    expect(mapBncJob({ title: "X" }).commitment).toBe("full-time"); // default

    // Contract fixture row should land at "contract".
    const credit = FIXTURE.data!.jobs!.find((j) => j.reqId === "JR-24012");
    expect(mapBncJob(credit as PhenomRawJob).commitment).toBe("contract");
  });

  it("respects explicit remote/hybrid flags before falling back to text heuristics", () => {
    expect(mapBncJob({ title: "X", remote: true }).location_type).toBe("remote");
    expect(mapBncJob({ title: "X", hybrid: "true" }).location_type).toBe("hybrid");

    // Fixture's wealth advisor sets hybrid: "true" — expect "hybrid".
    const wealth = FIXTURE.data!.jobs!.find((j) => j.reqId === "JR-23789");
    expect(mapBncJob(wealth as PhenomRawJob).location_type).toBe("hybrid");
  });

  it("produces a canonical emplois.bnc.ca URL even when applyUrl routes into Workday", () => {
    // BNC's applyUrl routes into bnc.wd3.myworkdayjobs.com — we ignore it
    // and synthesize the Phenom-facing /fr_CA/careers/jobdetail/<id>/<slug> URL.
    const raw: PhenomRawJob = {
      reqId: "JR-X",
      title: "Cloud MLOps & GenAI Lead",
      applyUrl:
        "https://bnc.wd3.myworkdayjobs.com/External/job/whatever/apply",
    };
    const job = mapBncJob(raw);
    expect(job.url).toBe(
      "https://emplois.bnc.ca/fr_CA/careers/jobdetail/JR-X/Cloud-MLOps-GenAI-Lead"
    );
    expect(job.url).not.toContain("workday");
  });

  it("aggregates multi_location into the canonical city/state/country string", () => {
    const credit = FIXTURE.data!.jobs!.find((j) => j.reqId === "JR-24012");
    const job = mapBncJob(credit as PhenomRawJob);
    expect(job.location).toBe("Toronto, Ontario, Canada");
  });

  it("falls back to city/state/country when multi_location is absent", () => {
    const raw: PhenomRawJob = {
      reqId: "JR-Y",
      title: "Test",
      city: "Montréal",
      state: "Quebec",
      country: "Canada",
    };
    const job = mapBncJob(raw);
    expect(job.location).toBe("Montréal, Quebec, Canada");
  });
});

describe("resolveJobCap (BNC)", () => {
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

describe("fixture sanity (BNC)", () => {
  it("contains the three reference jobs the tests depend on", () => {
    const ids = FIXTURE.data?.jobs?.map((j) => j.reqId);
    expect(ids).toEqual(
      expect.arrayContaining(["JR-23541", "JR-23789", "JR-24012"])
    );
  });

  it("contains at least 3 jobs from distinct departments", () => {
    const jobs = FIXTURE.data?.jobs ?? [];
    expect(jobs.length).toBeGreaterThanOrEqual(3);
    const departments = new Set(jobs.map((j) => j.multi_category?.[0]));
    expect(departments.size).toBeGreaterThanOrEqual(3);
  });
});
