import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { AppError, password } from "./validation.mjs";
const scrypt = promisify(scryptCallback);
let passwordWork = 0;
async function derive(value, salt, N) {
  if (passwordWork >= 4) {
    const error = new AppError("الخدمة مشغولة. حاول بعد قليل.", 503);
    error.retryAfter = 5;
    throw error;
  }
  passwordWork++;
  try {
    return await scrypt(value, salt, 64, {
      N,
      r: 8,
      p: N === 65536 ? 2 : 1,
      maxmem: 128 * 1024 * 1024,
    });
  } finally {
    passwordWork--;
  }
}
export const DUMMY_PASSWORD_HASH =
  "scrypt$65536$0123456789abcdef0123456789abcdef$" + "00".repeat(64);
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("hex");
export async function hashPassword(value) {
  password(value);
  const salt = randomBytes(16).toString("hex");
  const key = await derive(value, salt, 65536);
  return `scrypt$65536$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(value, stored) {
  if (typeof value !== "string" || value.length > 128 || !stored) return false;
  if (typeof stored !== "string") return false;
  const modern =
    /^scrypt\$(65536|32768)\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored);
  const legacy = /^([a-f0-9]{32}):([a-f0-9]{128})$/.exec(stored);
  const match = modern || legacy;
  if (!match) return false;
  const [, salt, hash] = modern ? [null, modern[2], modern[3]] : match;
  const key = await derive(value, salt, modern ? Number(modern[1]) : 16384);
  const expected = Buffer.from(hash, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}
export function sameSecret(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)))
  );
}
export function checkOrigin(request) {
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError("الطلب يجب أن يأتي من الموقع نفسه.", 403);
  const origin = request.headers.get("origin");
  const expected = new URL(request.url);
  // Next.js can use an internal hostname when constructing the request URL.
  // The HTTP Host represents the browser-facing host; never trust forwarded-host input here.
  const host = request.headers.get("host");
  if (host) expected.host = host;
  if (!origin || origin !== expected.origin)
    throw new AppError("الطلب يجب أن يأتي من الموقع نفسه.", 403);
}
