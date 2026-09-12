import { describe, expect, it } from "vitest";
import { embeddingFetchRetryDelay } from "./embedding-fetch-retry";

describe("embedding fetch retry policy", () => {
  it("backs off on the logged Gateway Timeout and stops after six attempts", () => {
    const response = { status: 504, error: { message: "Gateway Timeout" } };
    expect([1, 2, 3, 4, 5, 6, 7].map((attempt) =>
      embeddingFetchRetryDelay(response, attempt)
    )).toEqual([1000, 2000, 4000, 8000, 16000, null, null]);
  });

  it.each([0, 502, 503, 504, 520, 521, 522, 523, 524])(
    "retries transport/gateway status %i even with an unstructured body",
    (status) => {
      expect(embeddingFetchRetryDelay({
        status, error: { message: "<html>upstream unavailable</html>" },
      }, 1)).toBe(1000);
    }
  );

  it.each([400, 401, 403, 404, 409, 500])(
    "does not hide persistent query/auth failures (HTTP %i)",
    (status) => {
      expect(embeddingFetchRetryDelay({
        status, error: { message: "invalid query or credentials" },
      }, 1)).toBeNull();
    }
  );

  it("recognizes a bare gateway error when the status is not useful", () => {
    expect(embeddingFetchRetryDelay({
      status: 500, error: { message: "Gateway Timeout" },
    }, 1)).toBe(1000);
  });

  it("stops immediately on success", () => {
    expect(embeddingFetchRetryDelay({ status: 200, error: null }, 2)).toBeNull();
  });

  it("does not override an authentication status with gateway-like text", () => {
    expect(embeddingFetchRetryDelay({
      status: 401, error: { message: "Gateway Timeout" },
    }, 1)).toBeNull();
  });
});
