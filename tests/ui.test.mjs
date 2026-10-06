import test, { before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { SITE_DEFAULTS, settingsInput } from "../lib/validation.mjs";

let dom, createRoot, Admin, Portal, root, settings, user;
const errors = [];
const subject = {
  _id: "a".repeat(24),
  name: "إدارة الأعمال",
  code: "BIS301",
  department: "bis",
  year: 3,
  term: 1,
  academicYear: "2026/2027",
  active: true,
};
const resources = Array.from({ length: 24 }, (_, i) => ({
  _id: (i + 1).toString(16).padStart(24, "0"),
  title: `محاضرة إدارة الأعمال ${i + 1}`,
  subjectId: subject._id,
  lecture: i + 1,
  kind: "lecture",
  status: i % 3 === 0 ? "draft" : i % 3 === 1 ? "published" : "archived",
  links: [
    {
      url: "https://t.me/eia_students/12",
      provider: "telegram",
      private: false,
    },
  ],
  updatedAt: "2026-10-06T00:00:00Z",
}));
const originalFetch = globalThis.fetch;
const bundlePath = fileURLToPath(
  new URL(`../node_modules/.cache/eia-ui-${process.pid}.mjs`, import.meta.url),
);

before(async () => {
  dom = new JSDOM('<div id="root"></div>', { url: "https://eia.example/" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.localStorage = dom.window.localStorage;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { outputFiles } = await build({
    stdin: {
      contents:
        'export { default as Admin } from "./components/Admin.jsx"; export { default as Portal } from "./components/Portal.jsx";',
      resolveDir: fileURLToPath(new URL("..", import.meta.url)),
      loader: "jsx",
    },
    bundle: true,
    write: false,
    format: "esm",
    jsx: "automatic",
    external: ["react", "react/jsx-runtime"],
  });
  await mkdir(
    fileURLToPath(new URL("../node_modules/.cache", import.meta.url)),
    { recursive: true },
  );
  await writeFile(bundlePath, outputFiles[0].contents);
  ({ Admin, Portal } = await import(bundlePath));
  ({ createRoot } = await import("react-dom/client"));
  globalThis.fetch = async (path, options = {}) => {
    if (path === "/api/auth/session") return Response.json({ user });
    if (path === "/api/admin/overview")
      return Response.json({
        user,
        subjects: [subject],
        resources,
        news: [],
        admins: [user],
        audits: [],
        settings,
        storageBytes: 0,
      });
    if (path === "/api/public/catalog")
      return Response.json({
        subjects: [subject],
        resources: resources.filter((r) => r.status === "published"),
        news: [],
        settings,
      });
    if (path === "/api/admin/settings" && options.method === "PUT") {
      try {
        settings = settingsInput(JSON.parse(options.body));
        return Response.json({ ok: true });
      } catch (e) {
        return Response.json({ error: e.message }, { status: 400 });
      }
    }
    throw new Error(`Unexpected UI request: ${path}`);
  };
});
beforeEach(() => {
  settings = { ...SITE_DEFAULTS };
  user = {
    _id: "owner",
    name: "Test owner",
    email: "owner@example.test",
    role: "owner",
    active: true,
  };
  errors.length = 0;
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  root = createRoot(document.getElementById("root"), {
    onUncaughtError: (e) => errors.push(e),
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  assert.deepEqual(errors, []);
});
after(async () => {
  globalThis.fetch = originalFetch;
  dom.window.close();
  await unlink(bundlePath);
});
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function mount(Component) {
  await act(async () => {
    root.render(React.createElement(Component));
    await tick();
  });
}
function button(text) {
  const found = [...document.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === text,
  );
  assert.ok(found, `Missing button: ${text}`);
  return found;
}
function field(label) {
  const node = [...document.querySelectorAll("label.field")].find(
    (f) => f.firstElementChild.textContent === label,
  );
  assert.ok(node, `Missing field: ${label}`);
  return node.querySelector("input,textarea,select");
}
async function click(node) {
  await act(async () => {
    node.click();
    await tick();
  });
}
async function change(node, value) {
  const setter = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(node),
    "value",
  ).set;
  await act(async () => {
    setter.call(node, value);
    node.dispatchEvent(
      new window.Event(node.tagName === "SELECT" ? "change" : "input", {
        bubbles: true,
      }),
    );
    await tick();
  });
}

test("Owner can open settings, preview, validate and save without crashing", async () => {
  await mount(Admin);
  await click(button("إعدادات المنصة"));
  assert.match(document.querySelector("h1").textContent, /إعدادات المنصة/);
  assert.equal(button("حفظ الإعدادات").disabled, true);
  await change(field("اسم المنصة"), "مكتبة EIA");
  await change(field("لون المنصة"), "violet");
  await change(field("تنويه أعلى المنصة (اختياري)"), "تنويه للطلبة");
  assert.match(
    document.querySelector(".settings-preview").textContent,
    /مكتبة EIA/,
  );
  assert.equal(
    document.querySelector(".settings-preview").dataset.accent,
    "violet",
  );
  await change(
    field("رابط قناة أو مجموعة الطلبة (اختياري)"),
    "https://evil.example/eia_students",
  );
  await click(button("حفظ الإعدادات"));
  assert.match(
    document.querySelector('[role="alert"]').textContent,
    /تيليجرام/,
  );
  await change(
    field("رابط قناة أو مجموعة الطلبة (اختياري)"),
    "https://t.me/eia_students",
  );
  await click(button("حفظ الإعدادات"));
  assert.equal(settings.title, "مكتبة EIA");
  assert.equal(settings.accent, "violet");
  assert.equal(button("حفظ الإعدادات").disabled, true);
  await click(button("نظرة عامة"));
  await click(button("إعدادات المنصة"));
  assert.equal(field("اسم المنصة").value, "مكتبة EIA");
});

test("Admin list pages and filters reset; duplication creates a draft", async () => {
  await mount(Admin);
  await click(button("المحتوى والملفات"));
  assert.equal(document.querySelectorAll(".admin-list .list-row").length, 20);
  await click(button("التالي"));
  assert.equal(document.querySelectorAll(".admin-list .list-row").length, 4);
  await change(
    document.querySelector('[aria-label="حالة السجل"]'),
    "published",
  );
  assert.equal(document.querySelectorAll(".admin-list .list-row").length, 8);
  assert.equal(document.querySelector(".pagination"), null);
  await click(button("نسخ كمسودة"));
  assert.match(field("عنوان المحتوى").value, /نسخة/);
  assert.equal(field("حالة النشر").value, "draft");
  assert.equal(document.querySelector('form [type="file"]').value, "");
  await click(document.querySelector('[aria-label="إغلاق"]'));
  await click(button("مسح الفلاتر"));
  assert.equal(document.querySelectorAll(".admin-list .list-row").length, 20);
});

test("Shared content opens across profiles; completed and saved state survive remount", async () => {
  localStorage.setItem(
    "eia_profile",
    JSON.stringify({
      department: "bis",
      year: "1",
      term: "1",
      academicYear: "2026/2027",
      group: "",
    }),
  );
  const resource = resources[1];
  window.history.replaceState(null, "", `/?resource=${resource._id}`);
  await mount(Portal);
  assert.match(
    document.querySelector('[role="dialog"]').textContent,
    new RegExp(resource.title),
  );
  await click(button("علّم كمحتوى تمت مذاكرته"));
  await click(button("حفظ للرجوع إليه"));
  await click(button("مشاركة"));
  assert.equal(
    field("رابط مشاركة المحتوى").value,
    `https://eia.example/?resource=${resource._id}`,
  );
  assert.deepEqual(JSON.parse(localStorage.getItem("eia_completed")), [
    resource._id,
  ]);
  assert.deepEqual(JSON.parse(localStorage.getItem("eia_saved")), [
    resource._id,
  ]);
  await act(async () => root.unmount());
  root = createRoot(document.getElementById("root"), {
    onUncaughtError: (e) => errors.push(e),
  });
  await mount(Portal);
  assert.equal(button("تمت المذاكرة ✓").getAttribute("aria-pressed"), "true");
  assert.ok(button("إزالة من المحفوظات"));
  await click(document.querySelector('[aria-label="إغلاق"]'));
  assert.equal(
    new URL(window.location.href).searchParams.has("resource"),
    false,
  );
});

test("Unavailable shared content shows a notice and editors have no settings tab", async () => {
  window.history.replaceState(null, "", "/?resource=missing");
  await mount(Portal);
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.match(
    document.querySelector('[role="status"]').textContent,
    /غير متاح/,
  );
  await act(async () => root.unmount());
  root = createRoot(document.getElementById("root"), {
    onUncaughtError: (e) => errors.push(e),
  });
  user = { ...user, role: "editor" };
  await mount(Admin);
  assert.equal(
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent === "إعدادات المنصة",
    ),
    false,
  );
});
