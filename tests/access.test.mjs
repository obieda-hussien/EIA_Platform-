import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { request as httpRequest } from "node:http";
let server, origin;
const controlHost = "control.test", controlOrigin = "http://control.test";
function request(url, options = {}) {
  const headers = new Headers(options.headers);
  if (/^\/api\/(?:auth|admin)(?:\/|$)/.test(new URL(url).pathname)) {
    headers.set("host", controlHost);
    if (headers.get("origin") === origin) headers.set("origin", controlOrigin);
  }
  return transport(url, { ...options, headers });
}
// Node's native fetch replaces Host. HTTP requests preserve the authority
// needed to exercise both virtual hosts against the same isolated server.
function transport(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: options.method || "GET", headers: Object.fromEntries(new Headers(options.headers)) }, (res) => {
      const chunks = []; res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(res.headers)) {
          for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined) headers.append(name, item);
        }
        resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers }));
      });
    });
    req.on("error", reject); req.end(options.body);
  });
}
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
      env: { ...process.env, MONGODB_URI: "", ADMIN_SETUP_TOKEN: "", ADMIN_HOST: controlHost },
      stdio: "ignore",
    },
  );
  for (let i = 0; i < 100; i++) {
    try {
      const r = await request(origin);
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
test("Public home is separate from control login and dashboard", async () => {
  const home = await request(origin);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /EIA/);
  assert.equal((await request(`${origin}/admin`)).status, 404);
  assert.equal((await request(`${origin}/login`)).status, 404);
  const login = await request(`${origin}/login`, { headers: { host: controlHost } });
  assert.equal(login.status, 200);
  assert.match(await login.text(), /أهلًا بعودتك/);
});
test("Admin reads reject unauthenticated visitors", async () => {
  for (const path of ["admin/overview", "admin/admins", "admin/settings"])
    assert.equal((await request(`${origin}/api/${path}`)).status, 401);
});
test("Admin mutation is forbidden across origins, even before DB access", async () => {
  const r = await request(`${origin}/api/admin/resources`, {
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
  const r = await request(`${origin}/api/admin/resources`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(r.status, 401);
});
test("Missing database configuration hides infrastructure details", async () => {
  for (const path of ["public/catalog", "auth/status"]) {
    const r = await request(`${origin}/api/${path}`);
    assert.equal(r.status, 503);
    assert.doesNotMatch(
      (await r.json()).error,
      /MONGODB_URI|Atlas|password|mongodb/i,
    );
  }
});
test("Anonymous session exposes no account data or credentials", async () => {
  const r = await request(`${origin}/api/auth/session`);
  assert.deepEqual(await r.json(), { user: null });
  assert.match(r.headers.get("cache-control"), /no-store/);
});
test("Fresh CSP nonces apply to rendered scripts with hardened headers", async () => {
  const first = await request(origin),
    second = await request(origin);
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
      [400, 404].includes((await request(`${origin}/api/${path}`)).status),
    );
  assert.equal((await request(`${origin}/api/auth/login`)).status, 405);
});
test("Bootstrap is closed after its temporary secret is removed", async () => {
  const result = await request(`${origin}/api/auth/setup`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(result.status, 403);
});
test("Malformed cookies and anonymous security routes expose no account secrets", async () => {
  const result = await request(`${origin}/api/auth/session`, {
    headers: { cookie: "__Host-eia_session=forged-value" },
  });
  assert.deepEqual(await result.json(), { user: null });
  for (const path of ["security", "sessions"])
    assert.equal((await request(`${origin}/api/auth/${path}`)).status, 401);
});
test("Logout expires the host-prefixed cookie with its required Secure attributes", async () => {
  const result = await request(`${origin}/api/auth/logout`, {
    method: "POST", headers: { origin },
  });
  assert.equal(result.status, 200);
  const cookie = result.headers.getSetCookie().find((value) => value.startsWith("__Host-eia_session="));
  assert.ok(cookie); assert.match(cookie, /Secure/i); assert.match(cookie, /Path=\//i); assert.match(cookie, /Max-Age=0/i);
});

test("Dashboard rejects anonymous and malformed-cookie visitors before rendering", async () => {
  for (const cookie of ["", "__Host-eia_session=forged-value"]) {
    const result = await request(`${origin}/admin`, { headers: { host: controlHost, cookie }, redirect: "manual" });
    assert.equal(result.status, 307);
    assert.equal(result.headers.get("location"), "/login");
    assert.doesNotMatch(await result.text(), /sidebar-user|حسابات الأدمنز|حجم الملفات المرفوعة/);
  }
});
test("Student origin blocks ALL private APIs despite forged forwarding and session headers", async () => {
  for (const path of ["auth/session", "auth/status", "auth/security", "admin/overview", "admin/settings"]) {
    const result = await fetch(`${origin}/api/${path}`, { headers: { "x-forwarded-host": controlHost, "x-surface": "control", cookie: `__Host-eia_session=${"a".repeat(64)}` } });
    assert.equal(result.status, 404);
    assert.match(result.headers.get("cache-control"), /no-store/);
  }
});
test("Student-origin writes cannot operate the control API", async () => {
  const result = await transport(`${origin}/api/admin/settings`, { method: "PUT", headers: { host: controlHost, origin, "content-type": "application/json" }, body: "{}" });
  assert.equal(result.status, 403);
});
test("Control root redirects to protected dashboard and does not serve the student catalog", async () => {
  const result = await request(origin, { headers: { host: controlHost }, redirect: "manual" });
  assert.equal(result.status, 307); assert.equal(result.headers.get("location"), "/admin");
  assert.equal((await request(`${origin}/api/public/catalog`, { headers: { host: controlHost } })).status, 404);
});
test("Student HTML contains no administration links", async () => {
  const html = await (await request(origin)).text();
  assert.doesNotMatch(html, /href="\/(?:admin|login)"|eia-control-obieda/);
});
