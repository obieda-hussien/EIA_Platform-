import test from "node:test";
import assert from "node:assert/strict";
import {
  externalLink,
  links,
  validatePdf,
  UPLOAD_LIMIT,
  resourceInput,
  subjectInput,
  newsInput,
  normalize,
  escapeRegex,
  email,
  password,
} from "../lib/validation.mjs";
import {
  hashPassword,
  verifyPassword,
  checkOrigin,
  sameSecret,
} from "../lib/security.mjs";
test("Drive and Docs links preserve sharing parameters", () => {
  assert.equal(
    externalLink("https://drive.google.com/file/d/abc_123/view?usp=sharing")
      .provider,
    "drive",
  );
  assert.equal(
    externalLink("https://drive.google.com/open?id=abc").provider,
    "drive",
  );
  assert.equal(
    externalLink("https://docs.google.com/document/d/abc/edit").provider,
    "drive",
  );
});
test("Telegram requires message links and identifies private membership", () => {
  assert.equal(externalLink("https://t.me/eia_channel/12").private, false);
  assert.equal(externalLink("https://t.me/c/123456/12").private, true);
  assert.equal(
    externalLink("https://t.me/s/eia_channel/12").provider,
    "telegram",
  );
  assert.throws(() => externalLink("https://t.me/eia_channel"));
});
test("Reject redirect, script, credential, spoofed-host and unsupported links", () => {
  for (const link of [
    "javascript:alert(1)",
    "http://drive.google.com/file/d/x/view",
    "https://drive.google.com.evil.test/file/d/a",
    "https://user:pass@drive.google.com/file/d/a",
    "https://drive.google.com:8443/file/d/a",
    "https://drive.google.com/redirect?url=evil",
    "https://t.me/+invite",
    "https://example.com/a.pdf",
  ])
    assert.throws(() => externalLink(link));
});
test("Limit alternate links", () =>
  assert.throws(() => links(Array(5).fill("https://t.me/eia_channel/12"))));
test("Upload checks size, extension and magic bytes", () => {
  assert.equal(
    validatePdf(Buffer.from("%PDF-1.7\n%%EOF"), "lecture.pdf").length,
    14,
  );
  assert.throws(() => validatePdf(Buffer.from("<script>"), "x.pdf"));
  assert.throws(() => validatePdf(Buffer.from("%PDF-1.7"), "x.html"));
  assert.throws(() => validatePdf(Buffer.alloc(UPLOAD_LIMIT + 1), "x.pdf"));
});
test("Resource validation prevents arbitrary fields and invalid state", () => {
  const input = {
    title: "  عنوان  ",
    description: "",
    subjectId: "a".repeat(24),
    lecture: 1,
    kind: "summary",
    status: "draft",
    source: "",
    links: [],
    upload: { data: "forged" },
  };
  assert.equal(resourceInput(input).title, "عنوان");
  assert.equal(resourceInput(input).upload, undefined);
  assert.throws(() =>
    resourceInput({ ...input, status: "approved-by-institute" }),
  );
  assert.throws(() => resourceInput({ ...input, lecture: -1 }));
});
test("Academic classification validates department, year and term", () => {
  const input = {
    name: "مادة",
    code: "",
    department: "bis",
    year: 3,
    term: 1,
    academicYear: "2026/2027",
  };
  assert.equal(subjectInput(input).year, 3);
  assert.throws(() => subjectInput({ ...input, year: 5 }));
  assert.throws(() => subjectInput({ ...input, department: "forged" }));
  assert.throws(() => subjectInput({ ...input, term: 0 }));
});
test("Announcement expiry and source URLs validated", () => {
  const base = { title: "إعلان", body: "نص", status: "draft" };
  assert.equal(newsInput(base).expiresAt, null);
  assert.throws(() => newsInput({ ...base, expiresAt: "invalid" }));
  assert.throws(() => newsInput({ ...base, sourceUrl: "javascript:alert(1)" }));
});
test("Arabic search normalizes accents and regex literals stay literal", () => {
  assert.equal(normalize("إِدارة الأَعمال"), "ادارة الاعمال");
  const raw = ".*+(a)[x]";
  assert.equal(new RegExp(escapeRegex(raw)).test(raw), true);
  assert.equal(new RegExp(escapeRegex(raw)).test("anything"), false);
});
test("Password hashes are salted and verify correctly", async () => {
  const a = await hashPassword("long-secret-password");
  const b = await hashPassword("long-secret-password");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("long-secret-password", a), true);
  assert.equal(await verifyPassword("wrong-password", a), false);
  assert.equal(await verifyPassword("x".repeat(129), a), false);
});
test("Owner setup tokens compared without accepting missing tokens", () => {
  assert.equal(sameSecret("abc", "abc"), true);
  assert.equal(sameSecret("abc", "def"), false);
  assert.equal(sameSecret(undefined, undefined), false);
});
test("Write requests must have a matching origin", () => {
  const make = (origin) =>
    new Request("https://eia.example/api/admin/news", {
      method: "POST",
      headers: origin ? { origin } : {},
    });
  assert.doesNotThrow(() => checkOrigin(make("https://eia.example")));
  assert.throws(() => checkOrigin(make("https://evil.example")));
  assert.throws(() => checkOrigin(make()));
});
test("Origin protection uses the actual HTTP host behind Next.js", () => {
  const request = new Request("http://localhost:3000/api/admin/resources", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
  });
  assert.doesNotThrow(() => checkOrigin(request));
  const forged = new Request("http://localhost:3000/api/admin/resources", {
    method: "POST",
    headers: {
      host: "127.0.0.1:3000",
      origin: "https://evil.test",
      "x-forwarded-host": "evil.test",
    },
  });
  assert.throws(() => checkOrigin(forged));
});
test("Account validation rejects empty, malformed and oversized inputs", () => {
  assert.equal(email(" A@EXAMPLE.COM "), "a@example.com");
  assert.throws(() => email("bad"));
  assert.throws(() => password("short"));
  assert.throws(() => password("x".repeat(129)));
});


test("Surface authority is exact, fail-closed and ignores spoofed lookalikes", async () => {
  const { isControlHost, surfaceAllows } = await import("../lib/surface.mjs");
  assert.equal(isControlHost("CONTROL.TEST", "control.test"), true);
  for (const host of ["student.test", "control.test.evil", "control.test:444", "control.test@evil", ""]) {
    assert.equal(surfaceAllows(host, "/admin", "control.test"), false);
    assert.equal(surfaceAllows(host, "/api/auth/session", "control.test"), false);
  }
  assert.equal(surfaceAllows("control.test", "/admin", ""), false);
  assert.equal(surfaceAllows("control.test", "/api/public/catalog", "control.test"), false);
  assert.equal(surfaceAllows("student.test", "/", "control.test"), true);
});

test("Same-origin control writes do not inherit the internal server port", () => {
  const request = new Request("http://localhost:3000/api/admin/resources", {
    method: "POST", headers: { host: "control.test", origin: "http://control.test" },
  });
  assert.doesNotThrow(() => checkOrigin(request));
});
