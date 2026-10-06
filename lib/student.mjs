import { cookies } from 'next/headers';
import { ObjectId } from 'mongodb';
import { randomInt, createHmac } from 'node:crypto';
import { db } from './db.mjs';
import { AppError, text, password, integer } from './validation.mjs';
import { digest, token, hashPassword, verifyPassword, DUMMY_PASSWORD_HASH } from './security.mjs';
import { throttle } from './session.mjs';
import { institutionalEmail, studentDocument, studyState, plannerItems, personalProfile } from './student-data.mjs';
export const studentCookie = () => process.env.NODE_ENV === 'production' ? '__Host-eia_student' : 'eia_student';
export const deviceCookie = () => process.env.NODE_ENV === 'production' ? '__Host-eia_device' : 'eia_device';
export const metricsCookie = () => process.env.NODE_ENV === 'production' ? '__Host-eia_metrics' : 'eia_metrics';
export const keyValid = key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key);
export async function cookieKey(name) { const value = (await cookies()).get(name)?.value; return keyValid(value) ? value : null; }
export async function setCookie(name, value, maxAge) { (await cookies()).set(name, value, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge }); }
export async function deviceKey() {
  const existing = await cookieKey(deviceCookie());
  if (existing) return digest(existing);
  const value = token(); await setCookie(deviceCookie(), value, 90 * 86400); return digest(value);
}
export async function studentSession(required = true, touch = true) {
  const key = await cookieKey(studentCookie());
  if (key) {
    const d = await db(), now = new Date();
    const s = await d.collection('student_sessions').findOne({ _id: digest(key), expiresAt: { $gt: now }, lastSeenAt: { $gt: new Date(now - 30 * 60000) } });
    if (s) {
      const user = await d.collection('students').findOne({ _id: s.studentId, active: true }, { projection: { name: 1, email: 1, emailVerified: 1, authVersion: 1, personal: 1, profileVersion: 1, analyticsConsent: 1 } });
      if (user && (user.authVersion || 0) === (s.authVersion || 0)) {
        if (touch && now - s.lastSeenAt > 5 * 60000) await d.collection('student_sessions').updateOne({ _id: s._id }, { $max: { lastSeenAt: now } });
        return user;
      }
    }
  }
  if (required) throw new AppError('سجّل دخول حساب الطالب للمتابعة.', 401);
  return null;
}
async function startStudent(user) {
  const d = await db(), now = new Date(), raw = token(), deviceId = await deviceKey();
  const current = await cookieKey(studentCookie());
  if (current) await d.collection('student_sessions').deleteOne({ _id: digest(current) });
  await d.collection('student_sessions').insertOne({ _id: digest(raw), studentId: user._id, authVersion: user.authVersion || 0, deviceId, createdAt: now, lastSeenAt: now, expiresAt: new Date(now.valueOf() + 8 * 3600000) });
  await d.collection('student_device_links').updateOne({ _id: digest(`${deviceId}:${user._id}`) }, { $set: { lastSeenAt: now, expiresAt: new Date(now.valueOf() + 90 * 86400000) }, $setOnInsert: { deviceId, studentId: user._id, createdAt: now } }, { upsert: true });
  await setCookie(studentCookie(), raw, 8 * 3600);
}
export const emailReady = () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM && process.env.MFA_ENCRYPTION_KEY);
const emailCodeHash = (id, code) => createHmac('sha256', process.env.MFA_ENCRYPTION_KEY).update(`student-email-verification:${id}:${code}`).digest('hex');
export async function studentAction(req, entity, readBody, source) {
  const method = req.method;
  if (entity === 'session') {
    const user = await studentSession(false);
    const state = user ? await (await db()).collection('study_states').findOne({ _id: user._id }, { projection: { profile: 1, saved: 1, completed: 1, version: 1 } }) : null;
    return { user: user ? studentDocument(user) : null, state: state ? { ...state, _id: undefined } : null, emailVerificationAvailable: emailReady() };
  }
  if (entity === 'logout') {
    const key = await cookieKey(studentCookie());
    if (key) await (await db()).collection('student_sessions').deleteOne({ _id: digest(key) });
    await setCookie(studentCookie(), '', 0); return { ok: true };
  }
  if (['register','login'].includes(entity)) {
    await throttle(`student-auth:${source}`, 25);
    const b = await readBody(req), address = institutionalEmail(b.email);
    await throttle(`student-auth:${source}:${address}`, 8);
    const d = await db();
    if (entity === 'register') {
      await throttle(`student-register:${source}`, 10, 3600000);
      if (b.acceptPrivacy !== true) throw new AppError('راجع سياسة الحساب ومعرّف المتصفح ووافق عليها.');
      const user = { _id: new ObjectId(), name: text(b.name, 100), email: address, passwordHash: await hashPassword(password(b.password)), active: true, emailVerified: false, authVersion: 0, createdAt: new Date() };
      try { await d.collection('students').insertOne(user); }
      catch(e) { if (e.code === 11000) throw new AppError('تعذّر إنشاء الحساب. جرّب تسجيل الدخول أو بريدًا آخر.', 409); throw e; }
      await startStudent(user); return { user: studentDocument(user) };
    }
    const user = await d.collection('students').findOne({ email: address, active: true });
    const valid = await verifyPassword(b.password, user?.passwordHash || DUMMY_PASSWORD_HASH);
    if (!user || !valid) throw new AppError('البريد أو كلمة المرور غير صحيحة.', 401);
    await startStudent(user); return { user: studentDocument(user) };
  }
  const user = await studentSession(), d = await db();
  if (method !== 'GET') await throttle(`student-write:${user._id}`, 30, 60000);
  if (entity === 'profile') {
    const b=await readBody(req),value=personalProfile(b),version=integer(b.version??0,0,1000000000);
    const result=await d.collection('students').updateOne({_id:user._id,...(version?{profileVersion:version}:{$or:[{profileVersion:0},{profileVersion:{$exists:false}}]})},{$set:{name:value.name,personal:{phone:value.phone,studentCode:value.studentCode,city:value.city,bio:value.bio},updatedAt:new Date()},$inc:{profileVersion:1}});
    if(!result.matchedCount)throw new AppError('البروفايل اتغيّر من جهاز آخر. أعد تحميله قبل الحفظ.',409);
    return {ok:true};
  }
  if (entity === 'state') {
    const b = await readBody(req), version = integer(b.version ?? 0, 0, 1000000000), value = studyState(b);
    const current = await d.collection('study_states').findOne({ _id: user._id }, { projection: { version: 1 } });
    if ((current?.version || 0) !== version) throw new AppError('الحساب اتحدّث من جهاز آخر. أعد تحميل الحساب قبل المزامنة.', 409);
    if (!current) {
      try { await d.collection('study_states').insertOne({ _id: user._id, ...value, version: 1, updatedAt: new Date() }); }
      catch(e) { if(e.code === 11000) throw new AppError('أعد تحميل الحساب قبل المزامنة.', 409); throw e; }
    } else {
      const updated = await d.collection('study_states').updateOne({ _id: user._id, version }, { $set: { ...value, updatedAt: new Date() }, $inc: { version: 1 } });
      if (!updated.matchedCount) throw new AppError('أعد تحميل الحساب قبل المزامنة.', 409);
    }
    return { ok: true, version: version + 1 };
  }
  if (entity === 'planner') {
    if (method === 'GET') {
      const plan = await d.collection('study_plans').findOne({ _id: user._id });
      return { items: plan?.items || [], version: plan?.version || 0 };
    }
    const b = await readBody(req), items = plannerItems(b.items), version = integer(b.version ?? 0, 0, 1000000000);
    const current = await d.collection('study_plans').findOne({ _id: user._id }, { projection: { version: 1 } });
    if ((current?.version || 0) !== version) throw new AppError('الخطة اتغيّرت من جهاز آخر. حدّثها أولًا.', 409);
    if (!current) {
      try { await d.collection('study_plans').insertOne({ _id: user._id, items, version: 1, updatedAt: new Date() }); }
      catch(e) { if(e.code === 11000) throw new AppError('حدّث الخطة قبل الحفظ.', 409); throw e; }
    } else {
      const result = await d.collection('study_plans').updateOne({ _id: user._id, version }, { $set: { items, updatedAt: new Date() }, $inc: { version: 1 } });
      if (!result.matchedCount) throw new AppError('حدّث الخطة قبل الحفظ.', 409);
    }
    return { items, version: version + 1 };
  }
  if (entity === 'password') {
    const b = await readBody(req), stored = await d.collection('students').findOne({ _id: user._id, active: true });
    if (!await verifyPassword(b.currentPassword, stored?.passwordHash)) throw new AppError('كلمة المرور الحالية غير صحيحة.', 401);
    const passwordHash = await hashPassword(password(b.password));
    const result = await d.collection('students').updateOne({ _id: user._id, passwordHash: stored.passwordHash }, { $set: { passwordHash }, $inc: { authVersion: 1, personal: 1, profileVersion: 1, analyticsConsent: 1 } });
    if(!result.matchedCount) throw new AppError('أعد تسجيل الدخول.', 401);
    await d.collection('student_sessions').deleteMany({ studentId: user._id });
    await startStudent({ ...user, authVersion: (stored.authVersion || 0) + 1 }); return { ok: true };
  }
  if (entity === 'verification') {
    if (!emailReady()) throw new AppError('إرسال أكواد التحقق غير متاح حاليًا. حسابك يظل غير موثّق.', 503);
    if (user.emailVerified) return { ok: true };
    const b = await readBody(req);
    if (b.code) {
      await throttle(`student-code:${user._id}`, 5);
      if (!/^\d{6}$/.test(b.code)) throw new AppError('اكتب كود التحقق المكوّن من ٦ أرقام.');
      const confirmed = await d.collection('students').findOneAndUpdate({ _id: user._id, verificationHash: emailCodeHash(user._id, b.code), verificationExpiresAt: { $gt: new Date() } }, { $set: { emailVerified: true }, $unset: { verificationHash: '', verificationExpiresAt: '' } });
      if (!confirmed) throw new AppError('كود غير صحيح أو منتهي الصلاحية.', 400);
      return { ok: true };
    }
    await throttle(`student-mail:${user._id}`, 3, 3600000);
    await throttle(`student-mail-ip:${source}`, 10, 3600000);
    const code = String(randomInt(100000, 1000000)), hash = emailCodeHash(user._id, code);
    await d.collection('students').updateOne({ _id: user._id }, { $set: { verificationHash: hash, verificationExpiresAt: new Date(Date.now() + 10 * 60000) } });
    let result;
    try { result = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [user.email], subject: 'EIA Platform — كود التحقق', text: `كود التحقق من بريدك هو ${code}. صالح لمدة ١٠ دقائق. لا تشاركه مع أحد. منصة طلابية مستقلة عن المعهد.` }), signal: AbortSignal.timeout(12000) }); }
    catch {}
    if (!result?.ok) { await d.collection('students').updateOne({ _id: user._id, verificationHash: hash }, { $unset: { verificationHash: '', verificationExpiresAt: '' } }); throw new AppError('تعذّر إرسال الكود. حاول لاحقًا.', 503); }
    return { ok: true };
  }
  throw new AppError('المسار غير موجود.', 404);
}
