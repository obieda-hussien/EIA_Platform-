import { cookies } from "next/headers";
import { db } from "./db.mjs";
import { AppError } from "./validation.mjs";
import { digest, token } from "./security.mjs";
export async function session(required = true) {
  const key = (await cookies()).get("eia_session")?.value;
  if (!key) {
    if (required) throw new AppError("سجّل دخول الأدمن أولًا.", 401);
    return null;
  }
  const d = await db();
  const s = await d
    .collection("sessions")
    .findOne({ _id: digest(key), expiresAt: { $gt: new Date() } });
  const user =
    s &&
    (await d.collection("admins").findOne({ _id: s.adminId, active: true }));
  if (!user) {
    if (required) throw new AppError("انتهت الجلسة. سجّل الدخول مجددًا.", 401);
    return null;
  }
  return { _id: user._id, email: user.email, name: user.name, role: user.role };
}
export async function startSession(user) {
  const key = token();
  const expiresAt = new Date(Date.now() + 8 * 3600000);
  await (
    await db()
  )
    .collection("sessions")
    .insertOne({ _id: digest(key), adminId: user._id, expiresAt });
  (await cookies()).set("eia_session", key, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    expires: expiresAt,
  });
}
export async function endSession() {
  const c = await cookies();
  const key = c.get("eia_session")?.value;
  if (key)
    await (await db()).collection("sessions").deleteOne({ _id: digest(key) });
  c.delete("eia_session");
}
export function owner(user) {
  if (user.role !== "owner")
    throw new AppError("هذه العملية متاحة لمالك المنصة فقط.", 403);
}
export async function throttle(key, limit = 10) {
  const d = await db();
  const bucket = Math.floor(Date.now() / 600000);
  const hit = await d
    .collection("attempts")
    .findOneAndUpdate(
      { _id: digest(`${key}:${bucket}`) },
      {
        $inc: { count: 1 },
        $setOnInsert: { expiresAt: new Date(Date.now() + 1200000) },
      },
      { upsert: true, returnDocument: "after" },
    );
  if (hit.count > limit)
    throw new AppError("محاولات كثيرة. انتظر ١٠ دقائق ثم حاول مجددًا.", 429);
}
export async function audit(user, action, collection, id) {
  await (
    await db()
  )
    .collection("audit")
    .insertOne({
      actor: user.email,
      action,
      collection,
      recordId: String(id),
      createdAt: new Date(),
    });
}
