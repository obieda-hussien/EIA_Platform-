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


test("Student session and telemetry status expose no identity to an anonymous browser", async () => {
 const response=await request(`${origin}/api/student/session`);assert.equal(response.status,200);assert.deepEqual(await response.json(),{user:null,state:null,emailVerificationAvailable:false});assert.match(response.headers.get('cache-control'),/no-store/);
 const status=await request(`${origin}/api/telemetry/status`);assert.deepEqual(await status.json(),{enabled:false});
 for(const path of ['student/planner','admin/analytics','admin/campaigns','admin/students'])assert.equal((await request(`${origin}/api/${path}`)).status,401);
});
test("Control origin cannot use student accounts or tracking routes", async () => {
 for(const path of ['student/session','student/planner','telemetry/status'])assert.equal((await transport(`${origin}/api/${path}`,{headers:{host:controlHost}})).status,404);
 for(const path of ['student/register','telemetry/consent'])assert.equal((await transport(`${origin}/api/${path}`,{method:'POST',headers:{host:controlHost,origin:controlOrigin,'content-type':'application/json'},body:'{}'})).status,404);
});
test("New routes reject query injection, extra records and cross-origin writes before the database", async () => {
 for(const path of ['student/session?studentId=other','student/planner/extra','telemetry/status?deviceId=other','admin/analytics?days=365','admin/analytics?days=7&days=30'])assert.ok([400,404].includes((await request(`${origin}/api/${path}`)).status));
 for(const path of ['student/register','student/state','telemetry/consent','telemetry/pulse'])assert.equal((await request(`${origin}/api/${path}`,{method:path==='student/state'?'PUT':'POST',headers:{origin:'https://evil.test','content-type':'application/json'},body:'{}'})).status,403);
});
test("Student logout expires its distinct secure cookie without touching administration", async () => {
 const response=await request(`${origin}/api/student/logout`,{method:'POST',headers:{origin,'content-type':'application/json'},body:'{}'});assert.equal(response.status,200);const cookies=response.headers.getSetCookie();const cookie=cookies.find(x=>x.startsWith('__Host-eia_student='));assert.ok(cookie);assert.match(cookie,/Secure/i);assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=strict/i);assert.match(cookie,/Max-Age=0/i);assert.ok(!cookies.some(x=>x.startsWith('__Host-eia_session=')));
});


test("PWA manifest and icons have installable assets while service-worker caching stays private-data-free",async()=>{
 const r=await request(`${origin}/manifest.webmanifest`);assert.equal(r.status,200);const manifest=await r.json();assert.equal(manifest.display,'standalone');assert.equal(manifest.lang,'ar');assert.ok(manifest.icons.some(i=>i.purpose==='maskable'));
 for(const icon of manifest.icons)assert.equal((await request(origin+icon.src)).status,200);
 const worker=await request(`${origin}/sw.js`);assert.equal(worker.status,200);assert.match(worker.headers.get('cache-control'),/no-store/);assert.equal(worker.headers.get('service-worker-allowed'),'/');const source=await worker.text();assert.match(source,/offline\.html/);assert.doesNotMatch(source,/cache\.put|cacheFirst|caches\.match\(event\.request/);
 assert.equal((await request(`${origin}/manifest.webmanifest`,{headers:{host:controlHost}})).status,404);
});
test("SEO canonical metadata and structured data are server-rendered and private discovery is denied",async()=>{
 const home=await request(origin),html=await home.text();assert.match(html,/application\/ld\+json/);assert.match(html,/rel="canonical"/);assert.match(html,/manifest.webmanifest/);assert.match(html,/انتقل للمحتوى/);
 const about=await request(`${origin}/about`);assert.equal(about.status,200);const body=await about.text();assert.match(body,/منصة طلابية، لدراسة أوضح/);assert.match(body,/ليست|غير تابعة/);
 const robot=await request(`${origin}/robots.txt`,{headers:{host:'eia-platform-chi.vercel.app'}});assert.match(await robot.text(),/Sitemap: https:\/\/eia-platform-chi.vercel.app\/sitemap.xml/);
 const closed=await request(`${origin}/robots.txt`,{headers:{host:controlHost}});assert.match(await closed.text(),/Disallow: \//);assert.equal((await request(`${origin}/sitemap.xml`,{headers:{host:controlHost}})).status,404);assert.equal((await request(`${origin}/sitemap.xml`)).status,503);
});
test("Push reads reveal only capability, notifications stay private and cross-origin registration is blocked",async()=>{
 const config=await request(`${origin}/api/push/config`);assert.deepEqual(await config.json(),{available:false,publicKey:null});assert.equal((await request(`${origin}/api/admin/notifications`)).status,401);
 assert.equal((await request(`${origin}/api/push/subscribe`,{method:'POST',headers:{origin:'https://evil.test','content-type':'application/json'},body:'{}'})).status,403);
 assert.equal((await request(`${origin}/api/push/config`,{headers:{host:controlHost}})).status,404);
});
