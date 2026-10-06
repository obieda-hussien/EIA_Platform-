import test from "node:test";
import assert from "node:assert/strict";
import {
  adminRecords,
  sortResources,
  resourceShareUrl,
} from "../lib/catalog.mjs";
import { settingsInput, SITE_DEFAULTS } from "../lib/validation.mjs";

test("Settings, overview and audit tabs never filter an object as a collection", () => {
  const overview = {
    settings: { title: "EIA" },
    user: { role: "owner" },
    storageBytes: 12,
    audits: [],
  };
  for (const tab of ["settings", "overview", "audit", "user", "storageBytes"])
    assert.deepEqual(adminRecords(overview, tab), []);
  assert.deepEqual(adminRecords(null, "resources"), []);
  assert.deepEqual(adminRecords({ resources: {} }, "resources"), []);
});

test("Admin search normalizes Arabic and combines course/status filters", () => {
  const data = {
    subjects: [{ _id: "s1", name: "إِدارة الأَعمال" }],
    resources: [
      { _id: "r1", subjectId: "s1", title: "ملخص", status: "draft" },
      { _id: "r2", subjectId: "s1", title: "محاضرة", status: "published" },
      { _id: "r3", subjectId: "s2", title: "ملخص", status: "draft" },
    ],
  };
  assert.deepEqual(
    adminRecords(data, "resources", {
      query: "ادارة",
      status: "draft",
      subject: "s1",
    }).map((r) => r._id),
    ["r1"],
  );
  assert.equal(adminRecords(data, "resources", { query: ".*" }).length, 0);
});

test("Archived courses and disabled admins use their active flag", () => {
  const data = {
    subjects: [
      { name: "a", active: true },
      { name: "b", active: false },
    ],
  };
  assert.deepEqual(
    adminRecords(data, "subjects", { status: "inactive" }).map((s) => s.name),
    ["b"],
  );
});

test("Student ordering is stable, handles general content, and leaves catalog untouched", () => {
  const data = [
    { title: "ب", lecture: 2, updatedAt: "2026-01-01" },
    { title: "أ", lecture: 0, updatedAt: "2026-02-01" },
  ];
  assert.equal(sortResources(data)[0].title, "أ");
  assert.equal(sortResources(data, "lecture")[0].lecture, 0);
  assert.equal(sortResources(data, "title")[0].title, "أ");
  assert.equal(data[0].title, "ب");
});

test("Shared resource links contain only the resource ID on the public page", () => {
  const url = new URL(
    resourceShareUrl(
      "https://eia.example/admin?private=value#x",
      "a".repeat(24),
    ),
  );
  assert.equal(url.pathname, "/");
  assert.equal(url.searchParams.get("resource"), "a".repeat(24));
  assert.equal(url.searchParams.has("private"), false);
  assert.equal(url.hash, "");
});

test("Branding settings allow bounded copy and a public Telegram community", () => {
  const settings = settingsInput({
    ...SITE_DEFAULTS,
    accent: "violet",
    bannerText: "تنويه",
    communityUrl: "https://t.me/eia_students",
  });
  assert.equal(settings.accent, "violet");
  assert.equal(settings.bannerText, "تنويه");
  assert.equal(
    settingsInput({ title: "EIA", description: "وصف" }).accent,
    "emerald",
  );
  for (const communityUrl of [
    "javascript:alert(1)",
    "https://t.me.evil.test/eia_students",
    "https://user:pass@t.me/eia_students",
    "https://t.me/eia_students?start=secret",
    "https://t.me/c/123/4",
  ])
    assert.throws(() => settingsInput({ ...SITE_DEFAULTS, communityUrl }));
  assert.throws(() => settingsInput({ ...SITE_DEFAULTS, accent: "red" }));
  assert.throws(() =>
    settingsInput({ ...SITE_DEFAULTS, bannerText: "x".repeat(241) }),
  );
});
