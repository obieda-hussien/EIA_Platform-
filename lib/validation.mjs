export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const UPLOAD_LIMIT = 2 * 1024 * 1024;
function objectInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AppError("بيانات الطلب غير صحيحة.");
}
export const DEPARTMENTS = [
  { id: "bis", name: "نظم معلومات الأعمال" },
  { id: "accounting", name: "المحاسبة والمراجعة" },
  { id: "business", name: "إدارة الأعمال" },
  { id: "finance", name: "التمويل" },
];
export function text(value, max = 200, required = true) {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw new AppError("راجع الحقول المطلوبة وطول النص.");
  return value.trim();
}
export function integer(value, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    throw new AppError("القيمة الرقمية غير صحيحة.");
  return n;
}
export function choice(value, options) {
  if (!options.includes(value)) throw new AppError("اختيار غير صحيح.");
  return value;
}
export function email(value) {
  const e = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    throw new AppError("البريد الإلكتروني غير صحيح.");
  return e;
}
export function password(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128)
    throw new AppError("كلمة المرور من ١٢ إلى ١٢٨ حرفًا.");
  return value;
}
export function normalize(value) {
  return String(value)
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .toLowerCase();
}
export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function externalLink(raw) {
  let u;
  try {
    u = new URL(text(raw, 1200));
  } catch {
    throw new AppError("الرابط غير صحيح.");
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port)
    throw new AppError("استخدم رابط HTTPS مباشرًا بدون بيانات دخول.");
  let provider;
  if (
    u.hostname === "drive.google.com" &&
    (/^\/file\/d\/[\w-]+(?:\/|$)/.test(u.pathname) ||
      (u.pathname === "/open" &&
        /^[\w-]+$/.test(u.searchParams.get("id") || "")))
  )
    provider = "drive";
  else if (
    u.hostname === "docs.google.com" &&
    /^\/(document|presentation|spreadsheets)\/d\/[\w-]+(?:\/|$)/.test(
      u.pathname,
    )
  )
    provider = "drive";
  else if (
    u.hostname === "t.me" &&
    (/^\/(?:s\/)?[A-Za-z][A-Za-z0-9_]{3,31}\/\d+\/?$/.test(u.pathname) ||
      /^\/c\/\d+\/\d+\/?$/.test(u.pathname))
  )
    provider = "telegram";
  else throw new AppError("استخدم رابط ملف Google Drive أو رسالة تيليجرام.");
  u.hash = "";
  return {
    url: u.href,
    provider,
    private: provider === "telegram" && u.pathname.startsWith("/c/"),
  };
}
export function links(value) {
  if (!Array.isArray(value) || value.length > 4)
    throw new AppError("يمكن إضافة ٤ روابط بحد أقصى.");
  return value.filter(Boolean).map(externalLink);
}
export function validatePdf(bytes, name) {
  if (bytes.byteLength < 8 || bytes.byteLength > UPLOAD_LIMIT)
    throw new AppError("ملف PDF يجب ألا يتجاوز ٢ ميجابايت.");
  if (
    !/\.pdf$/i.test(name) ||
    Buffer.from(bytes).subarray(0, 5).toString() !== "%PDF-"
  )
    throw new AppError("الرفع المباشر متاح لملفات PDF فقط.");
  return Buffer.from(bytes);
}
export function subjectInput(b) {
  objectInput(b);
  return {
    name: text(b.name, 150),
    code: text(b.code, 40, false),
    department: choice(
      b.department,
      DEPARTMENTS.map((d) => d.id),
    ),
    year: integer(b.year, 1, 4),
    term: integer(b.term, 1, 2),
    academicYear: text(b.academicYear, 20),
    lecturer: text(b.lecturer || "", 150, false),
    group: text(b.group || "", 40, false),
    active: b.active !== false,
  };
}
export function resourceInput(b) {
  objectInput(b);
  return {
    title: text(b.title, 200),
    description: text(b.description || "", 2000, false),
    subjectId: text(b.subjectId, 24),
    lecture: integer(b.lecture, 0, 100),
    kind: choice(b.kind, ["summary", "lecture", "section", "exam", "answers"]),
    status: choice(b.status, ["draft", "published", "archived"]),
    source: text(b.source || "", 250, false),
    links: links(b.links || []),
  };
}
export function newsInput(b) {
  objectInput(b);
  const expiresAt = b.expiresAt ? new Date(b.expiresAt) : null;
  if (expiresAt && Number.isNaN(expiresAt.valueOf()))
    throw new AppError("تاريخ انتهاء الإعلان غير صحيح.");
  return {
    title: text(b.title, 200),
    body: text(b.body, 6000),
    department: b.department
      ? choice(
          b.department,
          DEPARTMENTS.map((d) => d.id),
        )
      : "",
    year: b.year ? integer(b.year, 1, 4) : 0,
    pinned: Boolean(b.pinned),
    status: choice(b.status, ["draft", "published", "archived"]),
    sourceUrl: b.sourceUrl ? officialUrl(b.sourceUrl) : "",
    expiresAt,
  };
}
export const SITE_DEFAULTS = {
  title: "EIA Platform",
  description: "مكتبتك الدراسية، في مكان واحد.",
  accent: "emerald",
  bannerText: "",
  communityUrl: "",
};
export function settingsInput(b) {
  objectInput(b);
  const communityUrl = text(b.communityUrl || "", 600, false);
  if (communityUrl) {
    const u = new URL(officialUrl(communityUrl));
    if (
      u.hostname !== "t.me" ||
      u.port ||
      !/^\/[A-Za-z][A-Za-z0-9_]{4,31}\/?$/.test(u.pathname) ||
      u.search ||
      u.hash
    )
      throw new AppError(
        "استخدم رابط قناة أو مجموعة تيليجرام عامة مثل https://t.me/eia_students.",
      );
  }
  return {
    title: text(b.title, 100),
    description: text(b.description, 400),
    accent: choice(b.accent || "emerald", ["emerald", "violet", "blue"]),
    bannerText: text(b.bannerText || "", 240, false),
    communityUrl,
  };
}
function officialUrl(raw) {
  let u;
  try {
    u = new URL(text(raw, 1200));
  } catch {
    throw new AppError("رابط المصدر غير صحيح.");
  }
  if (u.protocol !== "https:" || u.username || u.password)
    throw new AppError("رابط المصدر يجب أن يستخدم HTTPS.");
  return u.href;
}
