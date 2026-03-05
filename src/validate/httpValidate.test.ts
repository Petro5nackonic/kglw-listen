import test from "node:test";
import assert from "node:assert/strict";

import { classifyHttpStatus, validateUrlWithRangeGet } from "./httpValidate.ts";

test("classifyHttpStatus maps expected response groups", () => {
  assert.equal(classifyHttpStatus(200), "ok");
  assert.equal(classifyHttpStatus(206), "ok");
  assert.equal(classifyHttpStatus(404), "not_found");
  assert.equal(classifyHttpStatus(401), "restricted");
  assert.equal(classifyHttpStatus(403), "restricted");
  assert.equal(classifyHttpStatus(503), "unstable");
  assert.equal(classifyHttpStatus(500), "error");
});

test("validateUrlWithRangeGet retries unstable and then succeeds", async () => {
  const statuses = [503, 503, 206];
  const calls: Array<{ method?: string; range?: string }> = [];
  const fetchImpl = async (_url: string, init?: RequestInit) => {
    calls.push({
      method: init?.method,
      range: (init?.headers as Record<string, string>)?.Range,
    });
    return { status: statuses.shift() ?? 503 } as Response;
  };
  const result = await validateUrlWithRangeGet("https://example.com/a.mp3", {
    fetchImpl,
    retries: 4,
    sleep: async () => {},
    jitterRatio: 0,
  });
  assert.equal(result.ok, true);
  assert.equal(result.kind, "ok");
  assert.equal(calls.length, 3);
  assert.equal(calls[0]?.method, "GET");
  assert.equal(calls[0]?.range, "bytes=0-0");
});

test("validateUrlWithRangeGet reports restricted without retry loop", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { status: 401 } as Response;
  };
  const result = await validateUrlWithRangeGet("https://example.com/a.mp3", {
    fetchImpl,
    retries: 4,
    sleep: async () => {},
    jitterRatio: 0,
  });
  assert.equal(result.ok, false);
  assert.equal(result.kind, "restricted");
  assert.equal(calls, 1);
});
