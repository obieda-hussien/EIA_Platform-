import {
  randomBytes,
  createHmac,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import { AppError } from "./validation.mjs";
import { digest } from "./security.mjs";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes) {
  let bits = 0,
    value = 0,
    result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
function decode(value) {
  if (!/^[A-Z2-7]{16,64}$/.test(value))
    throw new AppError("مفتاح المصادقة غير صالح.", 503);
  let bits = 0,
    buffer = 0;
  const result = [];
  for (const char of value) {
    buffer = (buffer << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      result.push((buffer >>> bits) & 255);
    }
  }
  return Buffer.from(result);
}
export const newMfaSecret = () => base32(randomBytes(20));
export function totp(secret, counter) {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac("sha1", decode(secret)).update(bytes).digest();
  const offset = hash[19] & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
export function matchingCounter(
  secret,
  code,
  lastCounter = -1,
  now = Date.now(),
) {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return null;
  const counter = Math.floor(now / 30000);
  for (const value of [counter, counter - 1, counter + 1]) {
    if (
      value >= 0 &&
      value > lastCounter &&
      timingSafeEqual(Buffer.from(totp(secret, value)), Buffer.from(code))
    )
      return value;
  }
  return null;
}
function encryptionKey() {
  const raw = process.env.MFA_ENCRYPTION_KEY;
  if (!raw || !/^[A-Za-z0-9_-]{43}$/.test(raw))
    throw new AppError("التحقق بخطوتين غير متاح حاليًا.", 503);
  return Buffer.from(raw, "base64url");
}
export const mfaAvailable = () =>
  /^[A-Za-z0-9_-]{43}$/.test(process.env.MFA_ENCRYPTION_KEY || "");
export function encryptMfa(secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from("eia-mfa-v1"));
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}
export function decryptMfa(stored) {
  try {
    const [version, iv, tag, data] = stored.split(".");
    if (version !== "v1") throw new Error();
    const cipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      Buffer.from(iv, "base64url"),
    );
    cipher.setAAD(Buffer.from("eia-mfa-v1"));
    cipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      cipher.update(Buffer.from(data, "base64url")),
      cipher.final(),
    ]).toString("utf8");
  } catch {
    throw new AppError("تعذر التحقق من المصادقة. تواصل مع مالك المنصة.", 503);
  }
}
export function newRecoveryCodes() {
  const codes = Array.from({ length: 8 }, () =>
    randomBytes(10).toString("hex"),
  );
  return { codes, hashes: codes.map(digest) };
}
export async function verifyMfa(collection, user, code, now = Date.now()) {
  if (!user.mfaEnabled) return true;
  const counter = matchingCounter(
    decryptMfa(user.mfaSecret),
    code,
    user.mfaLastCounter ?? -1,
    now,
  );
  if (counter !== null) {
    const result = await collection.updateOne(
      {
        _id: user._id,
        mfaEnabled: true,
        mfaSecret: user.mfaSecret,
        $or: [
          { mfaLastCounter: { $lt: counter } },
          { mfaLastCounter: { $exists: false } },
        ],
      },
      { $set: { mfaLastCounter: counter } },
    );
    return result.matchedCount === 1;
  }
  if (typeof code !== "string" || !/^[a-f0-9]{20}$/.test(code)) return false;
  const hash = digest(code);
  const result = await collection.updateOne(
    { _id: user._id, mfaEnabled: true, mfaRecovery: hash },
    { $pull: { mfaRecovery: hash } },
  );
  return result.matchedCount === 1;
}
