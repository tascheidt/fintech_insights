import { describe, expect, it } from "vitest";
import { readerAuthHeaders } from "./reader-auth";

describe("readerAuthHeaders", () => {
  it("sends no credential when JINA_API_KEY is unset or blank", () => {
    expect(readerAuthHeaders({})).toEqual({});
    expect(readerAuthHeaders({ JINA_API_KEY: "  " })).toEqual({});
  });

  it("sends a bearer credential when JINA_API_KEY is set", () => {
    expect(readerAuthHeaders({ JINA_API_KEY: "jina_test" })).toEqual({
      Authorization: "Bearer jina_test",
    });
  });
});
