import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import { AppError, password } from "./validation.mjs";
const scrypt = promisify(scryptCallback);
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("hex");
export async function hashPassword(value) {
  password(value);
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(value, salt, 64);
  return `${salt}:${key.toString("hex")}`;
}
export async function verifyPassword(value, stored) {
  if (typeof value !== "string" || value.length > 128 || !stored) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const key = await scrypt(value, salt, 64);
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
  const origin = request.headers.get("origin");
  const expected = new URL(request.url);
  // Next.js can use an internal hostname when constructing the request URL.
  // The HTTP Host represents the browser-facing host; never trust forwarded-host input here.
  const host = request.headers.get("host");
  if (host) expected.host = host;
  if (!origin || origin !== expected.origin)
    throw new AppError("الطلب يجب أن يأتي من الموقع نفسه.", 403);
}
