import test, { before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { SITE_DEFAULTS, settingsInput } from "../lib/validation.mjs";

let dom, createRoot, Admin, Portal, root, settings, user, securityState, studentSnapshot, studentPlan, campaignRecords;
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
  Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
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
    if (path === "/api/student/session") return Response.json(studentSnapshot);
    if (path === "/api/student/register" && options.method === "POST") {
      const b = JSON.parse(options.body);
      if (!b.acceptPrivacy) return Response.json({error:"راجع الموافقة"},{status:400});
      studentSnapshot = { user: {_id:"student-one",name:b.name,email:b.email,role:"student",emailVerified:false},state:null,emailVerificationAvailable:false };
      return Response.json({user:studentSnapshot.user});
    }
    if (path === "/api/student/logout") { studentSnapshot = {user:null,state:null,emailVerificationAvailable:false}; return Response.json({ok:true}); }
    if (path === "/api/student/planner") {
      if (options.method === "PUT") { const b=JSON.parse(options.body);studentPlan={items:b.items,version:studentPlan.version+1}; }
      return Response.json(studentPlan);
    }
    if (path === "/api/student/state") { const b=JSON.parse(options.body);studentSnapshot.state={profile:b.profile,saved:b.saved,completed:b.completed,version:b.version+1};return Response.json({version:b.version+1}); }
    if (path === "/api/telemetry/consent") return Response.json({enabled:JSON.parse(options.body).enabled});
    if (path === "/api/telemetry/pulse") return Response.json({enabled:true});
    if (path === "/api/telemetry/event") return Response.json({ok:true});
    if (path.startsWith("/api/admin/analytics")) return Response.json({from:"2026-10-01",today:{day:"2026-10-06",devices:0,sessions:0},daily:[],totals:{sessions:0,foregroundMs:0,activeMs:0},onlineDevices:0,avgOnlineMs:0,registered:0,ads:[],views:[],generatedAt:"2026-10-06T00:00:00Z"});
    if (path === "/api/admin/campaigns") {
      if(options.method==="POST")campaignRecords.push({...JSON.parse(options.body),_id:"f".repeat(24)});
      return Response.json({campaigns:campaignRecords});
    }
    if (path === "/api/admin/notifications") return Response.json(options.method==="POST"?{sent:1,failed:0,skipped:0,next:null}:{available:true,subscribers:1,news:[{_id:"a".repeat(24),title:"إعلان عام"}]});
    if (path === "/api/admin/students") return Response.json({students:[],sharedBrowsers:[]});
    if (path === "/api/auth/session") return Response.json({ user });
    if (path === "/api/auth/security") return Response.json(securityState);
    if (
      path === "/api/auth/sessions" &&
      (!options.method || options.method === "GET")
    )
      return Response.json({
        sessions: [
          {
            _id: "a".repeat(64),
            current: true,
            lastSeenAt: "2026-10-06T00:00:00Z",
          },
        ],
      });
    if (path === "/api/auth/mfa-enroll" && options.method === "POST")
      return Response.json({
        secret: "ABCDEFGHIJKLMNOPQRSTUVWX234567AB",
        account: user.email,
      });
    if (path === "/api/auth/mfa-confirm" && options.method === "POST") {
      securityState = {
        mfaEnabled: true,
        mfaAvailable: true,
        recoveryRemaining: 8,
      };
      return Response.json({
        ok: true,
        recoveryCodes: Array.from({ length: 8 }, (_, i) =>
          String(i).repeat(20),
        ),
      });
    }
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
  studentSnapshot = {user:null,state:null,emailVerificationAvailable:false}; studentPlan = {items:[],version:0}; campaignRecords=[];
  settings = { ...SITE_DEFAULTS };
  securityState = {
    mfaEnabled: false,
    mfaAvailable: true,
    recoveryRemaining: 0,
  };
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
    root.render(React.createElement(Component, Component === Admin ? { initialUser: user } : {}));
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
    if (node.getAttribute("aria-label") === "إغلاق") await new Promise(resolve => setTimeout(resolve, 180));
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

test("Admins can enroll MFA and save recovery codes without exposing them elsewhere", async () => {
  await mount(Admin);
  await click(button("أمان الحساب"));
  assert.equal(button("إعداد التحقق بخطوتين").disabled, true);
  await change(field("كلمة المرور الحالية"), "secure-test-password");
  await click(button("إعداد التحقق بخطوتين"));
  assert.ok(document.querySelector(".mfa-secret"));
  assert.equal(field("كلمة المرور الحالية").value, "");
  await change(field("رمز المصادقة أو كود الاسترداد"), "123456");
  await click(button("تأكيد التفعيل"));
  assert.equal(document.querySelector(".mfa-secret"), null);
  assert.equal(document.querySelectorAll(".recovery-codes code").length, 8);
  await click(button("حفظتها في مكان آمن"));
  assert.equal(document.querySelectorAll(".recovery-codes code").length, 0);
});

test("Student home search carries its query into the library and has no admin links", async () => {
  await mount(Portal);
  assert.equal(document.querySelector('a[href="/admin"]'), null);
  const search = document.querySelector('[aria-label="ابحث عن محاضرة أو ملخص"]');
  await change(search, "إدارة الأعمال 2");
  await act(async () => {
    search.closest("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
    await tick();
  });
  assert.equal(document.querySelector('[aria-label="بحث في المكتبة"]').value, "إدارة الأعمال 2");
  assert.match(document.querySelector("h1").textContent, /المكتبة الدراسية/);
});
test("Control navigation opens, switches section and closes without losing dashboard tools", async () => {
  await mount(Admin);
  const toggle = document.querySelector('[aria-controls="control-navigation"]');
  await click(toggle); assert.equal(toggle.getAttribute("aria-expanded"), "true");
  await click(button("إعدادات المنصة"));
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.match(document.querySelector("h1").textContent, /إعدادات المنصة/);
  const studentLink = document.querySelector('.admin-sidebar a[target="_blank"]');
  assert.equal(studentLink.href, "https://eia-platform-chi.vercel.app/");
});


test("Student signup opens a separate account without administration tools", async () => {
  await mount(Portal);
  await click(document.querySelector('[aria-label="تسجيل دخول الطالب"]'));
  await click(button("إنشاء حساب"));
  await change(field("اسمك"), "طالب اختبار");
  await change(field("بريد المعهد"), "bis.2410423@eia.edu.eg");
  await change(field("كلمة المرور"), "fixture-private-student-password");
  await click(document.querySelector('.student-auth-form input[type="checkbox"]'));
  const form = document.querySelector('.student-auth-form');
  await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();});
  assert.ok(document.querySelector('[aria-label="فتح حساب الطالب"]'));
  assert.match(document.querySelector('.student-identity').textContent, /بريد غير موثّق/);
  assert.equal(document.querySelector('a[href="/admin"]'),null);
  assert.match(document.querySelector('.account-bottom').textContent, /بدون صلاحيات إدارة/);
});
test("Student planner saves a private task and completed status", async () => {
  studentSnapshot = {user:{_id:"student-one",name:"طالب اختبار",email:"bis.2410423@eia.edu.eg",emailVerified:false},state:null,emailVerificationAvailable:false};
  await mount(Portal);await click(document.querySelector('[aria-label="فتح حساب الطالب"]'));await click(button("خطة الدراسة"));
  await change(field("مهمة الدراسة"), "مراجعة قواعد البيانات");
  const form = document.querySelector('.planner-form');
  await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();});
  assert.equal(studentPlan.items.length,1);assert.equal(studentPlan.items[0].title,"مراجعة قواعد البيانات");
  await click(document.querySelector('.planner-item input[type="checkbox"]'));
  assert.equal(studentPlan.items[0].done,true);
});
test("Dashboard has real empty analytics and campaign drafting controls", async () => {
  await mount(Admin);await click(button("إحصائيات النشاط"));
  assert.match(document.querySelector('.insights-page').textContent,/لسه مفيش نشاط مقاس/);
  assert.match(document.querySelector('.insights-page').textContent,/وقت التبويب الظاهر/);
  await click(button("الإعلانات الممولة"));await click(button("حملة جديدة"));
  await change(field("عنوان الحملة"),"مصدر دراسي");await change(field("رابط الإعلان"),"https://eia.edu.eg/");
  const form = document.querySelector('[role="dialog"] form');
  await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await tick();});
  assert.equal(campaignRecords.length,1);assert.equal(campaignRecords[0].status,"draft");
});
test("Editors never see activity, campaign or student-directory navigation", async () => {
  user={...user,role:"editor"};await mount(Admin);
  for(const label of ["إحصائيات النشاط","الإعلانات الممولة","حسابات الطلبة"])assert.equal([...document.querySelectorAll('.admin-sidebar button')].some(b=>b.textContent.trim()===label),false);
});


test("Student homepage and account modal pass automated accessibility structure checks",async()=>{
 await mount(Portal);const axe=(await import('axe-core')).default;
 const check=async()=>{const result=await axe.run(document.getElementById('root'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']},rules:{'color-contrast':{enabled:false}}});assert.deepEqual(result.violations.map(v=>({id:v.id,impact:v.impact})),[]);};
 await check();await click(button('تسجيل الدخول'));await check();
});


test("Admins can select a general announcement and inspect its push delivery result",async()=>{
 await mount(Admin);await click(button('إشعارات الطلبة'));const select=document.querySelector('select');await change(select,'a'.repeat(24));await click(button('إرسال تنبيه الإعلان للمشتركين'));assert.match(document.body.textContent,/مقبول للإرسال: 1/);
});
