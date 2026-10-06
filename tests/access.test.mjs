import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
let server, origin;
before(async () => {
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  origin = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "-H",
      "127.0.0.1",
      "-p",
      String(port),
    ],
    {
      env: { ...process.env, MONGODB_URI: "", ADMIN_SETUP_TOKEN: "" },
      stdio: "ignore",
    },
  );
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(origin);
      if (r.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    "Production test server failed to start. Run npm run build first.",
  );
});
after(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((r) => server.once("exit", r));
  }
});
test("Public home and admin login page render on production server", async () => {
  const home = await fetch(origin);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /EIA/);
  assert.equal((await fetch(`${origin}/admin`)).status, 200);
});
test("Admin reads reject unauthenticated visitors", async () => {
  for (const path of ["admin/overview", "admin/admins", "admin/settings"])
    assert.equal((await fetch(`${origin}/api/${path}`)).status, 401);
});
test("Admin mutation is forbidden across origins, even before DB access", async () => {
  const r = await fetch(`${origin}/api/admin/resources`, {
    method: "POST",
    headers: {
      origin: "https://evil.test",
      "content-type": "application/json",
    },
    body: "{}",
  });
  assert.equal(r.status, 403);
});
test("Same-origin writes still require authentication", async () => {
  const r = await fetch(`${origin}/api/admin/resources`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(r.status, 401);
});
test("Missing database configuration hides infrastructure details", async () => {
  for (const path of ["public/catalog", "auth/status"]) {
    const r = await fetch(`${origin}/api/${path}`);
    assert.equal(r.status, 503);
    assert.doesNotMatch(
      (await r.json()).error,
      /MONGODB_URI|Atlas|password|mongodb/i,
    );
  }
});
test("Anonymous session exposes no account data or credentials", async () => {
  const r = await fetch(`${origin}/api/auth/session`);
  assert.deepEqual(await r.json(), { user: null });
  assert.match(r.headers.get("cache-control"), /no-store/);
});
test("Fresh CSP nonces apply to rendered scripts with hardened headers", async () => {
  const first = await fetch(origin),
    second = await fetch(origin);
  const policy = first.headers.get("content-security-policy");
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
  const nonce = /'nonce-([^']+)'/.exec(policy)?.[1];
  assert.ok(nonce);
  assert.notEqual(policy, second.headers.get("content-security-policy"));
  assert.ok((await first.text()).includes(`nonce="${nonce}"`));
  assert.equal(first.headers.get("x-frame-options"), "DENY");
  assert.equal(first.headers.get("x-content-type-options"), "nosniff");
});
test("Unknown paths, malformed IDs and query pollution fail before MongoDB", async () => {
  for (const path of [
    "public/catalog/extra",
    "auth/session/extra",
    "admin/unknown",
    "public/file/bad",
    "public/catalog?random=x",
  ])
    assert.ok(
      [400, 404].includes((await fetch(`${origin}/api/${path}`)).status),
    );
  assert.equal((await fetch(`${origin}/api/auth/login`)).status, 405);
});
test("Bootstrap is closed after its temporary secret is removed", async () => {
  const result = await fetch(`${origin}/api/auth/setup`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(result.status, 403);
});
test("Malformed cookies and anonymous security routes expose no account secrets", async () => {
  const result = await fetch(`${origin}/api/auth/session`, {
    headers: { cookie: "__Host-eia_session=forged-value" },
  });
  assert.deepEqual(await result.json(), { user: null });
  for (const path of ["security", "sessions"])
    assert.equal((await fetch(`${origin}/api/auth/${path}`)).status, 401);
});
