import { describe, expect, it } from "vitest";
import { decodeGreenhouseContent } from "./greenhouse";
import { htmlToText } from "./utils";

describe("decodeGreenhouseContent", () => {
  it("decodes the entity-escaped HTML the Job Board API returns", () => {
    const escaped =
      "&lt;div class=&quot;content-intro&quot;&gt;&lt;p&gt;Questrade &amp;amp; you&lt;/p&gt;&lt;/div&gt;";
    const html = decodeGreenhouseContent(escaped);
    expect(html).toBe('<div class="content-intro"><p>Questrade &amp; you</p></div>');
    expect(htmlToText(html)).toBe("Questrade & you");
  });

  it("leaves real HTML untouched", () => {
    const html = "<p>Use &lt;b&gt; for bold</p>";
    expect(decodeGreenhouseContent(html)).toBe(html);
  });

  it("returns an empty string for missing content", () => {
    expect(decodeGreenhouseContent("")).toBe("");
  });
});
