import { db } from "./db.mjs";
import {
  session,
  startSession,
  currentSessionId,
  throttle,
  audit,
  SESSION_VERSION,
  IDLE_MS,
} from "./session.mjs";
import { AppError, password } from "./validation.mjs";
import { verifyPassword, hashPassword } from "./security.mjs";
import {
  mfaAvailable,
  newMfaSecret,
  encryptMfa,
  decryptMfa,
  matchingCounter,
  newRecoveryCodes,
  verifyMfa,
} from "./mfa.mjs";
export async function accountAction(req, entity, record, body) {
  const user = await session();
  const d = await db(),
    admins = d.collection("admins"),
    sessions = d.collection("sessions");
  const current = await currentSessionId();
  if (req.method === "GET" && entity === "security") {
    const full = await admins.findOne(
      { _id: user._id },
      { projection: { mfaEnabled: 1, mfaRecovery: 1 } },
    );
    return {
      mfaEnabled: Boolean(full?.mfaEnabled),
      mfaAvailable: mfaAvailable(),
      recoveryRemaining: full?.mfaRecovery?.length || 0,
    };
  }
  if (entity === "sessions") {
    if (req.method === "GET") {
      const list = await sessions
        .find(
          {
            adminId: user._id,
            version: SESSION_VERSION,
            expiresAt: { $gt: new Date() },
            lastSeenAt: { $gt: new Date(Date.now() - IDLE_MS) },
          },
          { projection: { _id: 1, createdAt: 1, lastSeenAt: 1, expiresAt: 1 } },
        )
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray();
      return {
        sessions: list.map((s) => ({ ...s, current: s._id === current })),
      };
    }
    if (record === current)
      throw new AppError("استخدم تسجيل الخروج لإنهاء الجلسة الحالية.");
    if (record) await sessions.deleteOne({ _id: record, adminId: user._id });
    else
      await sessions.deleteMany({ adminId: user._id, _id: { $ne: current } });
    await audit(user, "revoke-sessions", "admins", user._id);
    return { ok: true };
  }
  await throttle(`security:${user._id}`, 8);
  const b = await body(req);
  const full = await admins.findOne({ _id: user._id, active: true });
  if (!full) throw new AppError("انتهت الجلسة.", 401);
  if (entity === "mfa-confirm") {
    if (
      full.mfaEnabled ||
      !full.mfaPending ||
      !(full.mfaPendingExpiresAt instanceof Date) ||
      full.mfaPendingExpiresAt.valueOf() <= Date.now()
    )
      throw new AppError("ابدأ إعداد المصادقة من جديد.");
    const counter = matchingCounter(decryptMfa(full.mfaPending), b.code);
    if (counter === null) throw new AppError("رمز المصادقة غير صحيح.", 401);
    const { codes, hashes } = newRecoveryCodes();
    const result = await admins.updateOne(
      {
        _id: user._id,
        mfaEnabled: { $ne: true },
        mfaPending: full.mfaPending,
        mfaPendingExpiresAt: { $gt: new Date() },
      },
      {
        $set: {
          mfaEnabled: true,
          mfaSecret: full.mfaPending,
          mfaLastCounter: counter,
          mfaRecovery: hashes,
        },
        $inc: { authVersion: 1 },
        $unset: { mfaPending: "", mfaPendingExpiresAt: "" },
      },
    );
    if (!result.matchedCount)
      throw new AppError("ابدأ إعداد المصادقة من جديد.", 409);
    await sessions.deleteMany({ adminId: user._id });
    await startSession({
      ...full,
      mfaEnabled: true,
      authVersion: (full.authVersion ?? 0) + 1,
    });
    await audit(user, "enable-mfa", "admins", user._id);
    return { ok: true, recoveryCodes: codes };
  }
  if (!(await verifyPassword(b.currentPassword, full.passwordHash)))
    throw new AppError("بيانات التحقق غير صحيحة.", 401);
  if (entity === "mfa-enroll") {
    if (full.mfaEnabled)
      throw new AppError("التحقق بخطوتين مفعّل بالفعل.", 409);
    const secret = newMfaSecret();
    const encrypted = encryptMfa(secret);
    const result = await admins.updateOne(
      {
        _id: user._id,
        passwordHash: full.passwordHash,
        mfaEnabled: { $ne: true },
      },
      {
        $set: {
          mfaPending: encrypted,
          mfaPendingExpiresAt: new Date(Date.now() + 10 * 60000),
        },
      },
    );
    if (!result.matchedCount)
      throw new AppError("تغيّرت بيانات الحساب. حاول مجددًا.", 409);
    return { secret, issuer: "EIA Platform", account: user.email };
  }
  // A stolen session alone cannot change passwords or disable MFA.
  if (!(await verifyMfa(admins, full, b.code)))
    throw new AppError("بيانات التحقق غير صحيحة.", 401);
  if (entity === "password") {
    const value = password(b.newPassword);
    if (value === b.currentPassword)
      throw new AppError("اختار كلمة مرور جديدة.");
    const result = await admins.updateOne(
      { _id: user._id, passwordHash: full.passwordHash },
      {
        $set: {
          passwordHash: await hashPassword(value),
          passwordChangedAt: new Date(),
        },
        $inc: { authVersion: 1 },
      },
    );
    if (!result.matchedCount)
      throw new AppError("تغيّرت بيانات الحساب. سجّل الدخول مجددًا.", 409);
  } else if (entity === "mfa-disable") {
    if (!full.mfaEnabled) throw new AppError("التحقق بخطوتين غير مفعّل.", 409);
    const result = await admins.updateOne(
      { _id: user._id, mfaSecret: full.mfaSecret },
      {
        $set: { mfaEnabled: false },
        $inc: { authVersion: 1 },
        $unset: {
          mfaSecret: "",
          mfaLastCounter: "",
          mfaRecovery: "",
          mfaPending: "",
          mfaPendingExpiresAt: "",
        },
      },
    );
    if (!result.matchedCount)
      throw new AppError("تغيّرت بيانات الحساب. حاول مجددًا.", 409);
  }
  await sessions.deleteMany({ adminId: user._id });
  await startSession({
    ...full,
    mfaEnabled: entity === "mfa-disable" ? false : full.mfaEnabled,
    authVersion: (full.authVersion ?? 0) + 1,
  });
  await audit(
    user,
    entity === "password" ? "change-password" : "disable-mfa",
    "admins",
    user._id,
  );
  return { ok: true };
}
