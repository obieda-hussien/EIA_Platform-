import test from "node:test";
import assert from "node:assert/strict";
import { readLimited } from "../lib/http.mjs";
test("Reads bounded requests without relying on Content-Length", async () => {
  const request = new Request("https://eia.test", {
    method: "POST",
    body: "hello",
  });
  assert.equal(
    new TextDecoder().decode(await readLimited(request, 5)),
    "hello",
  );
});
test("Rejects streamed bodies that exceed the byte limit", async () => {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(4));
      c.enqueue(new Uint8Array(4));
      c.close();
    },
  });
  const request = new Request("https://eia.test", {
    method: "POST",
    body: stream,
    duplex: "half",
  });
  await assert.rejects(readLimited(request, 6), (e) => e.status === 413);
});
test("Rejects oversized declared Content-Length before reading", async () => {
  const request = new Request("https://eia.test", {
    method: "POST",
    body: "hi",
    headers: { "content-length": "99999" },
  });
  await assert.rejects(readLimited(request, 6), (e) => e.status === 413);
});
