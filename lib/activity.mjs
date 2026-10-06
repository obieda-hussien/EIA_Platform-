import { db } from './db.mjs';
import { ObjectId } from 'mongodb';
import { createSnapshotCache } from './guard.mjs';
const metricCaches = { 7: createSnapshotCache(20000), 30: createSnapshotCache(20000) };
import { digest, token } from './security.mjs';
import { AppError } from './validation.mjs';
import { throttle } from './session.mjs';
import { cookieKey, setCookie, metricsCookie, deviceCookie, deviceKey, studentSession } from './student.mjs';
import { cairoDay, activityDelta, splitDays, safeEvent } from './activity-data.mjs';
export async function telemetryAction(req, entity, readBody, source) {
  let raw = await cookieKey(metricsCookie());
  if (entity === 'status') return { enabled: Boolean(raw && await (await db()).collection('activity_sessions').findOne({ _id: digest(raw), consent: true, createdAt: { $gt: new Date(Date.now()-8*3600000) } })) };
  const b = await readBody(req);
  if (entity === 'consent') {
    if (typeof b.enabled !== 'boolean') throw new AppError('اختار تشغيل القياس أو إيقافه.');
    await throttle(`metrics-consent:${source}`, 20, 60000);
    const account=await studentSession(false,false);
    if(b.restore&&account)b.enabled=account.analyticsConsent===true;
    if(account&&!b.restore)await (await db()).collection('students').updateOne({_id:account._id},{$set:{analyticsConsent:b.enabled,analyticsConsentAt:new Date()}});
    if (!b.enabled) {
      if(raw) await (await db()).collection('activity_sessions').updateOne({ _id: digest(raw) }, { $set: { consent: false, visible: false, active: false } });
      await setCookie(metricsCookie(), '', 0); return { enabled: false };
    }
    const d = await db(), now = new Date();
    const prior = raw ? await d.collection('activity_sessions').findOne({ _id: digest(raw), consent: true }) : null;
    if (prior && now-prior.lastPulseAt < 30 * 60000 && now-prior.createdAt < 8 * 3600000) return { enabled: true };
    raw = token(); const deviceId = await deviceKey();
    await d.collection('activity_sessions').insertOne({ _id: digest(raw), deviceId, consent: true, visible: false, active: false, foregroundMs: 0, activeMs: 0, createdAt: now, lastPulseAt: now, expiresAt: new Date(now.valueOf()+30*86400000) });
    await setCookie(metricsCookie(), raw, 8*3600); return { enabled: true };
  }
  if (!raw) return { enabled: false };
  const d = await db(), id = digest(raw);
  await throttle(`metrics:${id}`, 24, 60000);
  const previous = await d.collection('activity_sessions').findOne({ _id: id, consent: true, createdAt: { $gt: new Date(Date.now()-8*3600000) } });
  if (!previous) return { enabled: false };
  const currentAccount=await studentSession(false,false);if(currentAccount&&currentAccount.analyticsConsent!==true)return {enabled:false};
  const now = new Date();
  if(['ad-view','ad-click'].includes(entity)){
    if(!/^[a-f0-9]{24}$/.test(b.target||'')||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(b.requestId||''))throw new AppError('بيانات القياس غير صحيحة.');
    if(!await d.collection('campaigns').findOne({_id:ObjectId.createFromHexString(b.target),status:'published',startsAt:{$lte:now},$or:[{endsAt:null},{endsAt:{$gt:now}}]},{projection:{_id:1}}))throw new AppError('الإعلان غير متاح.',404);
    await throttle(`ad-events:${id}`,12,60000);
    const key=digest(`${id}:${b.requestId}`),records=d.collection('ad_deliveries');
    if(entity==='ad-view'){
      const prior=await records.findOne({_id:key},{projection:{target:1}});if(prior&&prior.target!==b.target)throw new AppError('تعارض في قياس الإعلان.',409);
      await records.updateOne({_id:key},{$setOnInsert:{target:b.target,sessionId:id,day:cairoDay(now),clicked:false,createdAt:now,expiresAt:new Date(now.valueOf()+90*86400000)}},{upsert:true});return {ok:true};
    }
    const result=await records.updateOne({_id:key,sessionId:id,target:b.target,clicked:false},{$set:{clicked:true,clickedAt:now}});return {ok:true,counted:Boolean(result.matchedCount)};
  }
  if (entity === 'pulse') {
    const delta = activityDelta(previous, b, now.valueOf());
    const result = await d.collection('activity_sessions').updateOne({ _id: id, consent: true, lastPulseAt: previous.lastPulseAt }, { $set: { lastPulseAt: now, visible: delta.visible, active: delta.active }, $inc: { foregroundMs: delta.foregroundMs, activeMs: delta.activeMs } });
    if (!result.matchedCount) return { enabled: true };
    const user = await studentSession(false, false);
    if (!delta.foregroundMs && !delta.visible) return { enabled: true };
    const parts = splitDays(now.valueOf()-delta.foregroundMs, now.valueOf(), delta.foregroundMs, delta.activeMs);
    for (const part of parts) {
      const update = { $inc: { foregroundMs: part.foregroundMs, activeMs: part.activeMs }, $set: { lastSeenAt: now }, $setOnInsert: { day: part.day, deviceId: previous.deviceId, sessionId: id, expiresAt: new Date(now.valueOf()+90*86400000) } };
      if (user) update.$addToSet = { studentIds: user._id };
      await d.collection('activity_daily').updateOne({ _id: digest(`${id}:${part.day}`) }, update, { upsert: true });
    }
    return { enabled: true };
  }
  if (entity === 'event') {
    const event = safeEvent(b);
    if (event.type.startsWith('ad_')) {
      const campaign = await d.collection('campaigns').findOne({ _id: ObjectId.createFromHexString(event.target), status: 'published', startsAt: { $lte: now }, $or: [{ endsAt: null }, { endsAt: { $gt: now } }] }, { projection: { _id: 1 } });
      if(!campaign) throw new AppError('الإعلان غير متاح.',404);
    }
    if (event.type === 'resource_open') {
      const resource = await d.collection('resources').findOne({ _id: ObjectId.createFromHexString(event.target), status: 'published' }, { projection: { subjectId: 1 } });
      if(!resource || !await d.collection('subjects').findOne({ _id: resource.subjectId, active: true }, { projection:{_id:1} })) throw new AppError('المحتوى غير متاح.',404);
    }
    const day = cairoDay(now);
    await d.collection('activity_events').updateOne({ _id: digest(`${id}:${day}:${event.type}:${event.target}`) }, { $setOnInsert: { ...event, day, sessionId: id, deviceId: previous.deviceId, createdAt: now, expiresAt: new Date(now.valueOf()+90*86400000) } }, { upsert: true });
    if (event.type === 'ad_click') {
      await d.collection('activity_events').updateOne({ _id: digest(`${id}:${day}:ad_impression:${event.target}`) }, { $setOnInsert: { type: 'ad_impression', target: event.target, day, sessionId: id, deviceId: previous.deviceId, createdAt: now, expiresAt: new Date(now.valueOf()+90*86400000) } }, { upsert: true });
    }
    return { ok: true };
  }
  throw new AppError('المسار غير موجود.',404);
}
export function analyticsSnapshot(days = 30) {
  return metricCaches[days].get(() => readAnalytics(days));
}
async function readAnalytics(days) {
  const d = await db(), now = new Date(), today = cairoDay(now);
  const from = new Date(Date.parse(`${today}T00:00:00Z`)-(days-1)*86400000).toISOString().slice(0,10);
  const options = { maxTimeMS: 4000 };
  const [daily, live, ads, views, registered, deliveries] = await Promise.all([
    d.collection('activity_daily').aggregate([{ $match: { day: { $gte: from, $lte: today } } }, { $group: { _id:'$day', devices:{$addToSet:'$deviceId'}, sessions:{$sum:1}, foregroundMs:{$sum:'$foregroundMs'}, activeMs:{$sum:'$activeMs'} } }, { $project: { _id:0, day:'$_id', devices:{$size:'$devices'},sessions:1,foregroundMs:1,activeMs:1 } }, { $sort:{day:1} }],options).toArray(),
    d.collection('activity_sessions').aggregate([{ $match:{consent:true,visible:true,lastPulseAt:{$gt:new Date(now.valueOf()-45000)}} },{ $group:{_id:'$deviceId',foregroundMs:{$max:'$foregroundMs'},activeMs:{$max:'$activeMs'}} },{ $group:{_id:null,devices:{$sum:1},foregroundMs:{$sum:'$foregroundMs'},activeMs:{$sum:'$activeMs'}} }],options).toArray(),
    d.collection('activity_events').aggregate([{ $match:{ day:{$gte:from,$lte:today},type:{$in:['ad_impression','ad_click']} } },{ $group:{_id:{target:'$target',type:'$type'},sessions:{$sum:1}} }],options).toArray(),
    d.collection('activity_events').aggregate([{ $match:{ day:{$gte:from,$lte:today},type:'view' } },{ $group:{_id:'$target',sessions:{$sum:1}} },{ $sort:{sessions:-1} }],options).toArray(),
    d.collection('students').countDocuments({active:true},{maxTimeMS:4000}),
    d.collection('ad_deliveries').aggregate([{$match:{day:{$gte:from,$lte:today}}},{$group:{_id:'$target',impressions:{$sum:1},clicks:{$sum:{$cond:['$clicked',1,0]}}}}],options).toArray()
  ]);
  const totals = daily.reduce((v,r)=>({ sessions:v.sessions+r.sessions,foregroundMs:v.foregroundMs+r.foregroundMs,activeMs:v.activeMs+r.activeMs }),{sessions:0,foregroundMs:0,activeMs:0});
  return { timezone:'Africa/Cairo', days, from, today:daily.find(r=>r.day===today)||{day:today,devices:0,sessions:0,foregroundMs:0,activeMs:0}, daily, totals, onlineDevices:live[0]?.devices||0, avgOnlineMs:live[0]?.devices ? live[0].foregroundMs/live[0].devices : 0, registered, ads, views, deliveries, generatedAt:now };
}
