import { cookies } from "next/headers";
import { db } from "./db.mjs";
import { AppError } from "./validation.mjs";
import { digest, token } from "./security.mjs";
import { rateError } from "./guard.mjs";
export const SESSION_VERSION = 2;
export const IDLE_MS = 30 * 60000;
export const cookieName = () =>
  process.env.NODE_ENV === "production" ? "__Host-eia_session" : "eia_session";
export const validSessionKey = (key) =>
  typeof key === "string" && /^[a-f0-9]{64}$/.test(key);
export async function currentSessionId() {
  const key = (await cookies()).get(cookieName())?.value;
  return validSessionKey(key) ? digest(key) : null;
}
export async function session(required = true) {
  const sessionId = await currentSessionId();
  const now = new Date();
  let user, s;
  if (sessionId) {
    const d = await db();
    s = await d
      .collection("sessions")
      .findOne({
        _id: sessionId,
        version: SESSION_VERSION,
        expiresAt: { $gt: now },
        lastSeenAt: { $gt: new Date(now.valueOf() - IDLE_MS) },
      });
    user =
      s &&
      (await d
        .collection("admins")
        .findOne(
          { _id: s.adminId, active: true },
          {
            projection: {
              _id: 1,
              email: 1,
              name: 1,
              role: 1,
              mfaEnabled: 1,
              authVersion: 1,
            },
          },
        ));
    if (user && (s.authVersion ?? 0) !== (user.authVersion ?? 0)) user = null;
    if (user && !["owner", "admin", "editor"].includes(user.role)) user = null;
    if (user?.mfaEnabled && !s.mfaVerified) user = null;
    if (user && now.valueOf() - s.lastSeenAt.valueOf() > 5 * 60000)
      await d
        .collection("sessions")
        .updateOne({ _id: sessionId }, { $max: { lastSeenAt: now } });
  }
  if (!user) {
    if (required) throw new AppError("انتهت الجلسة. سجّل الدخول مجددًا.", 401);
    return null;
  }
  return {
    _id: user._id,
    email: user.email,
    name: user.name,
    role: user.role,
    mfaEnabled: Boolean(user.mfaEnabled),
  };
}
export async function startSession(user) {
  const key = token(),
    now = new Date(),
    expiresAt = new Date(now.valueOf() + 8 * 3600000);
  const d = await db();
  await d
    .collection("sessions")
    .insertOne({
      _id: digest(key),
      adminId: user._id,
      expiresAt,
      createdAt: now,
      lastSeenAt: now,
      version: SESSION_VERSION,
      authVersion: user.authVersion ?? 0,
      mfaVerified: Boolean(user.mfaEnabled),
    });
  const stale = await d
    .collection("sessions")
    .find({ adminId: user._id })
    .sort({ createdAt: -1 })
    .skip(10)
    .limit(100)
    .project({ _id: 1 })
    .toArray();
  if (stale.length)
    await d
      .collection("sessions")
      .deleteMany({ _id: { $in: stale.map((s) => s._id) } });
  const c = await cookies();
  c.set(cookieName(), key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
  if (cookieName() !== "eia_session") c.delete("eia_session");
}
export async function endSession() {
  const c = await cookies(),
    sessionId = await currentSessionId();
  if (sessionId)
    await (await db()).collection("sessions").deleteOne({ _id: sessionId });
  c.delete(cookieName());
  c.delete("eia_session");
}
export function owner(user) {
  if (user.role !== "owner")
    throw new AppError("هذه العملية متاحة لمالك المنصة فقط.", 403);
}
export async function throttle(key, limit = 10, windowMs = 600000) {
  const now = Date.now(),
    bucket = Math.floor(now / windowMs);
  const collection = (await db()).collection("attempts");
  const filter = { _id: digest(`${key}:${bucket}`) };
  const update = {
    $inc: { count: 1 },
    $setOnInsert: { expiresAt: new Date((bucket + 2) * windowMs) },
  };
  let hit;
  try {
    hit = await collection.findOneAndUpdate(filter, update, {
      upsert: true,
      returnDocument: "after",
    });
  } catch (e) {
    if (e.code !== 11000) throw e;
    hit = await collection.findOneAndUpdate(filter, update, {
      returnDocument: "after",
    });
  }
  if (!hit || hit.count > limit)
    throw rateError(((bucket + 1) * windowMs - now) / 1000);
}
export async function audit(user, action, collection, id) {
  await (await db())
    .collection("audit")
    .insertOne({
      actor: user.email,
      action,
      collection,
      recordId: String(id),
      createdAt: new Date(),
    });
}
