import { isIP } from "node:net";
import { AppError } from "./validation.mjs";
import { digest } from "./security.mjs";

// Only Vercel's overwritten client header is trusted in the deployed runtime.
// Self-hosting must provide a separately configured trusted proxy, not client XFF.
export function clientKey(request, deployed = process.env.VERCEL === "1") {
  const raw = deployed ? request.headers.get("x-vercel-forwarded-for") : "";
  const ip = raw?.trim();
  return digest(ip && isIP(ip) ? ip : "unidentified-client");
}
export function rateError(seconds) {
  const error = new AppError("طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.", 429);
  error.retryAfter = Math.max(1, Math.ceil(seconds));
  return error;
}
export function createLimiter(maxKeys = 4096, clock = Date.now) {
  const entries = new Map();
  return (key, limit, windowMs = 60000) => {
    const now = clock();
    let entry = entries.get(key);
    if (!entry || entry.until <= now) {
      if (!entry && entries.size >= maxKeys) {
        for (const [k, value] of entries)
          if (value.until <= now) entries.delete(k);
        // Fail closed rather than allowing arbitrary keys to evict live budgets.
        if (entries.size >= maxKeys) throw rateError(windowMs / 1000);
      }
      entry = { count: 0, until: now + windowMs };
      entries.set(key, entry);
    }
    if (++entry.count > limit) throw rateError((entry.until - now) / 1000);
  };
}
export const earlyLimit = createLimiter();
export function validateRoute(path, method, url) {
  if (!Array.isArray(path) || path.length < 2 || path.length > 3)
    throw new AppError("المسار غير موجود.", 404);
  const [area, entity, record] = path;
  const auth = [
    "session",
    "status",
    "login",
    "logout",
    "setup",
    "security",
    "password",
    "mfa-enroll",
    "mfa-confirm",
    "mfa-disable",
    "sessions",
  ];
  if (area === "auth") {
    if (
      !auth.includes(entity) ||
      (record && (entity !== "sessions" || !/^[a-f0-9]{64}$/.test(record)))
    )
      throw new AppError("المسار غير موجود.", 404);
    const allowed = ["session", "status", "security"].includes(entity)
      ? ["GET"]
      : entity === "sessions"
        ? record
          ? ["DELETE"]
          : ["GET", "DELETE"]
        : ["POST"];
    if (!allowed.includes(method))
      throw new AppError("طريقة الطلب غير متاحة.", 405);
  } else if (area === "student" || area === "telemetry" || area === "push") {
    const methods = area === "student"
      ? { session: ["GET"], register: ["POST"], login: ["POST"], logout: ["POST"], state: ["PUT"], planner: ["GET", "PUT"], password: ["POST"], verification: ["POST"] }
      : area === "push" ? {config:["GET"],subscribe:["POST"],unsubscribe:["POST"]} : { status: ["GET"], consent: ["POST"], pulse: ["POST"], event: ["POST"] };
    if (record || !Object.hasOwn(methods, entity)) throw new AppError("المسار غير موجود.", 404);
    if (!methods[entity].includes(method)) throw new AppError("طريقة الطلب غير متاحة.", 405);
  } else if (area === "public") {
    if (
      !(
        (entity === "catalog" && !record) ||
        (entity === "file" && /^[a-f0-9]{24}$/.test(record || ""))
      )
    )
      throw new AppError("المسار غير موجود.", 404);
    if (method !== "GET") throw new AppError("طريقة الطلب غير متاحة.", 405);
  } else if (area === "admin") {
    if (
      ![
        "overview",
        "settings",
        "admins",
        "subjects",
        "resources",
        "news",
        "analytics",
        "students",
        "campaigns",
        "notifications",
      ].includes(entity)
    )
      throw new AppError("المسار غير موجود.", 404);
    if (
      record &&
      !/^[a-f0-9]{24}$/.test(record) &&
      !(entity === "admins" && record === "owner")
    )
      throw new AppError("معرّف غير صحيح.");
    if (["overview", "settings", "analytics", "students", "notifications"].includes(entity) && record)
      throw new AppError("المسار غير موجود.", 404);
    const allowed =
      ["overview", "analytics", "students"].includes(entity)
        ? ["GET"]
        : entity === "notifications" ? ["GET", "POST"] : entity === "settings"
          ? ["GET", "PUT"]
          : record
            ? ["PUT", "DELETE"]
            : ["GET", "POST"];
    if (
      !allowed.includes(method) ||
      (method === "DELETE" && entity === "admins")
    )
      throw new AppError("طريقة الطلب غير متاحة.", 405);
  } else throw new AppError("المسار غير موجود.", 404);
  const query = [...url.searchParams];
  if (
    query.length &&
    !(
      ((area === "admin" && entity === "analytics" && query.length === 1 && query[0][0] === "days" && ["7", "30"].includes(query[0][1])) || (area === "public" &&
      entity === "file" &&
      query.length === 1 &&
      query[0][0] === "download" &&
      query[0][1] === "1"))
    )
  )
    throw new AppError("معاملات الطلب غير صحيحة.");
}

// One cached public snapshot per worker and one in-flight load. Never cache errors,
// sessions, admin data or PDFs. It is an origin optimization, not distributed WAF.
export function createSnapshotCache(ttl = 10000, clock = Date.now) {
  let value,
    until = 0,
    pending,
    generation = 0;
  return {
    async get(loader) {
      if (value && until > clock()) return value;
      if (pending) return pending;
      const version = generation;
      const task = Promise.resolve()
        .then(loader)
        .then((result) => {
          if (version === generation) {
            value = result;
            until = clock() + ttl;
          }
          return result;
        });
      pending = task;
      try {
        return await task;
      } finally {
        if (pending === task) pending = undefined;
      }
    },
    clear() {
      generation++;
      value = undefined;
      until = 0;
      pending = undefined;
    },
  };
}
export const catalogCache = createSnapshotCache();
