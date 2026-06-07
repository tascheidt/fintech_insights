/**
 * Tests for the pure-logic pieces of the Phenom-BMO scraper.
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
  deriveBmoWorkdayDetailUrl,
  extractEagerLoadPayload,
  mapBmoJob,
  resolveJobCap,
  type PhenomRawJob,
  type PhenomSearchPayload,
} from "./phenom-bmo";

const FIXTURE_PATH = resolve(__dirname, "__fixtures__/phenom-bmo-listing.json");
const FIXTURE: PhenomSearchPayload = JSON.parse(
  readFileSync(FIXTURE_PATH, "utf8")
);

describe("extractEagerLoadPayload (BMO)", () => {
  it("returns null when the marker is missing", () => {
    expect(extractEagerLoadPayload("<html><body>nothing here</body></html>")).toBeNull();
  });

  it("returns null when the JSON object is malformed", () => {
    // Truncated object — brace counter walks off the end.
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
    // A `}` inside a quoted string should NOT close the outer object.
    const wrapped = `garbage "eagerLoadRefineSearch":{"trick":"this has a } in it","status":200,"data":{"jobs":[]}}`;
    const got = extractEagerLoadPayload(wrapped);
    expect(got).not.toBeNull();
    expect(got!.data?.jobs).toEqual([]);
  });
});

describe("decodeHtmlEntities (BMO re-export)", () => {
  it("decodes the entity set Phenom uses in JSON-LD descriptions", () => {
    const encoded =
      "&lt;div&gt;Hello &amp; goodbye &quot;world&quot; with &nbsp; spaces and &#39;apostrophes&#39;&lt;/div&gt;";
    const decoded = decodeHtmlEntities(encoded);
    expect(decoded).toBe(
      "<div>Hello & goodbye \"world\" with   spaces and 'apostrophes'</div>"
    );
  });
});

describe("mapBmoJob", () => {
  it("maps the senior ML engineer fixture row to a complete JobData", () => {
    const ml = FIXTURE.data!.jobs!.find((j) => j.reqId === "R-2400512");
    expect(ml).toBeDefined();

    const job = mapBmoJob(ml as PhenomRawJob);
    expect(job.external_id).toBe("R-2400512");
    expect(job.title).toBe("Senior Machine Learning Engineer");
    expect(job.department).toBe("Technology | Data | Analytics");
    expect(job.team).toBe("Data Science & Machine Learning");
    expect(job.location).toBe("Toronto, Ontario, Canada");
    expect(job.url).toBe(
      "https://jobs.bmo.com/ca/en/job/R-2400512/Senior-Machine-Learning-Engineer"
    );
    expect(job.description_text).toMatch(/BMO's AI & Data team/);
    expect(job.description_html).toBeNull(); // populated by enrichment, not the mapper
    expect(job.commitment).toBe("full-time");
    expect(job.posted_date?.toISOString()).toBe("2026-03-04T00:00:00.000Z");
  });

  it("derives team from subCategory, distinct from department", () => {
    const vp = FIXTURE.data!.jobs!.find((j) => j.reqId === "R-2400771");
    const job = mapBmoJob(vp as PhenomRawJob);
    expect(job.department).toBe("Capital Markets | Investment Banking | Wealth");
    expect(job.team).toBe("Capital Markets & Investment Banking");
    expect(job.team).not.toBe(job.department);
  });

  it("handles missing reqId by falling back to jobUrl/applyUrl", () => {
    const raw: PhenomRawJob = {
      title: "Foo",
      jobUrl: "https://jobs.bmo.com/ca/en/job/FOO-1/Foo",
    };
    const job = mapBmoJob(raw);
    expect(job.external_id).toBe("");
    expect(job.url).toBe("https://jobs.bmo.com/ca/en/job/FOO-1/Foo");
  });

  it("infers commitment from the type field when present", () => {
    expect(mapBmoJob({ title: "X", type: "Contract" }).commitment).toBe("contract");
    expect(mapBmoJob({ title: "X", type: "Internship" }).commitment).toBe("internship");
    expect(mapBmoJob({ title: "X", type: "Part time" }).commitment).toBe("part-time");
    expect(mapBmoJob({ title: "X", type: "Full time" }).commitment).toBe("full-time");
    expect(mapBmoJob({ title: "X" }).commitment).toBe("full-time"); // default

    // Part-time fixture row should land at "part-time".
    const csr = FIXTURE.data!.jobs!.find((j) => j.reqId === "R-2400988");
    expect(mapBmoJob(csr as PhenomRawJob).commitment).toBe("part-time");
  });

  it("respects explicit remote/hybrid flags before falling back to text heuristics", () => {
    expect(mapBmoJob({ title: "X", remote: true }).location_type).toBe("remote");
    expect(mapBmoJob({ title: "X", hybrid: "true" }).location_type).toBe("hybrid");
  });

  it("produces a canonical jobs.bmo.com URL even when applyUrl routes into Workday", () => {
    // BMO's applyUrl routes into bmo.wd3.myworkdayjobs.com — we ignore it
    // and synthesize the Phenom-facing /ca/en/job/<id>/<slug> URL.
    const raw: PhenomRawJob = {
      reqId: "R-X",
      title: "Cloud MLOps & GenAI Lead",
      applyUrl:
        "https://bmo.wd3.myworkdayjobs.com/External/job/whatever/apply",
    };
    const job = mapBmoJob(raw);
    expect(job.url).toBe(
      "https://jobs.bmo.com/ca/en/job/R-X/Cloud-MLOps-GenAI-Lead"
    );
    expect(job.url).not.toContain("workday");
  });

  it("aggregates multi_location into the canonical city/state/country string", () => {
    const csr = FIXTURE.data!.jobs!.find((j) => j.reqId === "R-2400988");
    const job = mapBmoJob(csr as PhenomRawJob);
    expect(job.location).toBe("CALGARY, Alberta, Canada");
  });

  it("falls back to city/state/country when multi_location is absent", () => {
    const raw: PhenomRawJob = {
      reqId: "R-Y",
      title: "Test",
      city: "Toronto",
      state: "Ontario",
      country: "Canada",
    };
    const job = mapBmoJob(raw);
    expect(job.location).toBe("Toronto, Ontario, Canada");
  });
});

describe("deriveBmoWorkdayDetailUrl", () => {
  it("maps a BMO Workday applyUrl to its CXS detail endpoint (drops /apply)", () => {
    expect(
      deriveBmoWorkdayDetailUrl(
        "https://bmo.wd3.myworkdayjobs.com/External/job/Toronto-Ontario-Canada/Senior-Machine-Learning-Engineer_R-2400512/apply"
      )
    ).toBe(
      "https://bmo.wd3.myworkdayjobs.com/wday/cxs/bmo/External/job/Toronto-Ontario-Canada/Senior-Machine-Learning-Engineer_R-2400512"
    );
  });

  it("handles an applyUrl that has no trailing /apply", () => {
    expect(
      deriveBmoWorkdayDetailUrl(
        "https://bmo.wd3.myworkdayjobs.com/External/job/New-York-United-States/Vice-President-Equity-Research_R-2400771"
      )
    ).toBe(
      "https://bmo.wd3.myworkdayjobs.com/wday/cxs/bmo/External/job/New-York-United-States/Vice-President-Equity-Research_R-2400771"
    );
  });

  it("reads tenant + site from the URL so a site rename still resolves", () => {
    expect(
      deriveBmoWorkdayDetailUrl(
        "https://bmo.wd3.myworkdayjobs.com/Campus/job/Toronto-Ontario-Canada/New-Grad-Analyst_R-9/apply"
      )
    ).toBe(
      "https://bmo.wd3.myworkdayjobs.com/wday/cxs/bmo/Campus/job/Toronto-Ontario-Canada/New-Grad-Analyst_R-9"
    );
  });

  it("returns null for empty, non-Workday, or unparseable input", () => {
    expect(deriveBmoWorkdayDetailUrl(undefined)).toBeNull();
    expect(deriveBmoWorkdayDetailUrl(null)).toBeNull();
    expect(deriveBmoWorkdayDetailUrl("")).toBeNull();
    // A canonical jobs.bmo.com URL is NOT a Workday endpoint.
    expect(
      deriveBmoWorkdayDetailUrl("https://jobs.bmo.com/ca/en/job/R-1/Title")
    ).toBeNull();
    expect(deriveBmoWorkdayDetailUrl("not a url")).toBeNull();
    // Workday host but a non-/job path shape → null rather than a bad URL.
    expect(
      deriveBmoWorkdayDetailUrl("https://bmo.wd3.myworkdayjobs.com/External")
    ).toBeNull();
  });

  it("derives the detail URL from every applyUrl in the listing fixture", () => {
    for (const job of FIXTURE.data!.jobs!) {
      const url = deriveBmoWorkdayDetailUrl(job.applyUrl);
      expect(url).toMatch(
        /^https:\/\/bmo\.wd3\.myworkdayjobs\.com\/wday\/cxs\/bmo\/External\/job\//
      );
      // The reqId survives into the CXS path.
      expect(url).toContain(job.reqId!.replace(/^R-/, "R-"));
    }
  });
});

describe("resolveJobCap (BMO)", () => {
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

describe("fixture sanity (BMO)", () => {
  it("contains the three reference jobs the tests depend on", () => {
    const ids = FIXTURE.data?.jobs?.map((j) => j.reqId);
    expect(ids).toEqual(
      expect.arrayContaining(["R-2400512", "R-2400771", "R-2400988"])
    );
  });

  it("contains at least 3 jobs from distinct departments", () => {
    const jobs = FIXTURE.data?.jobs ?? [];
    expect(jobs.length).toBeGreaterThanOrEqual(3);
    const departments = new Set(jobs.map((j) => j.multi_category?.[0]));
    expect(departments.size).toBeGreaterThanOrEqual(3);
  });
});
