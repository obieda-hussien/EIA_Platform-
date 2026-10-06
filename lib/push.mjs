import {db} from './db.mjs';
import {digest,token} from './security.mjs';
import {cookieKey,setCookie} from './student.mjs';
import {throttle} from './session.mjs';
import {AppError} from './validation.mjs';
import {ObjectId} from 'mongodb';
import {pushSubscription} from './push-data.mjs';
const cookie=()=>process.env.NODE_ENV==='production'?'__Host-eia_push':'eia_push';
export const pushReady=()=>Boolean(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT);
export async function pushAction(req,entity,readBody,source){
 if(entity==='config')return {available:pushReady(),publicKey:pushReady()?process.env.VAPID_PUBLIC_KEY:null};
 const raw=await cookieKey(cookie());
 if(entity==='unsubscribe'){if(raw)await (await db()).collection('push_subscriptions').deleteOne({_id:digest(raw)});await setCookie(cookie(),'',0);return {ok:true};}
 if(!pushReady())throw new AppError('الإشعارات غير متاحة حاليًا.',503);
 await throttle(`push-subscribe:${source}`,10,3600000);
 const body=await readBody(req),sub=pushSubscription(body.subscription),d=await db(),key=raw||token(),id=digest(key),endpointHash=digest(sub.endpoint),now=new Date();
 const existing=await d.collection('push_subscriptions').findOne({endpointHash},{projection:{_id:1}});
 if(existing&&existing._id!==id)throw new AppError('الاشتراك مرتبط بمتصفح آخر. ألغِه من إعدادات المتصفح ثم أعد المحاولة.',409);
 try{await d.collection('push_subscriptions').updateOne({_id:id},{$set:{subscription:sub,endpointHash,updatedAt:now,expiresAt:new Date(now.valueOf()+90*86400000)}},{upsert:true});}catch(e){if(e.code===11000)throw new AppError('تعذّر حفظ الاشتراك. أعد المحاولة.',409);throw e;}
 await setCookie(cookie(),key,90*86400);return {ok:true};
}
export async function notificationAction(req,readBody){
 const d=await db(),now=new Date();
 if(req.method==='GET')return {available:pushReady(),subscribers:await d.collection('push_subscriptions').countDocuments({expiresAt:{$gt:now}},{maxTimeMS:3000}),news:await d.collection('news').find({status:'published',department:'',year:0,$or:[{expiresAt:null},{expiresAt:{$gt:now}}]},{projection:{title:1},maxTimeMS:3000}).sort({createdAt:-1}).limit(100).toArray()};
 if(!pushReady())throw new AppError('إرسال الإشعارات غير متاح.',503);
 const b=await readBody(req);if(!/^[a-f0-9]{24}$/.test(b.newsId||'')||(b.after&&!/^[a-f0-9]{64}$/.test(b.after)))throw new AppError('طلب غير صحيح.');
 const news=await d.collection('news').findOne({_id:ObjectId.createFromHexString(b.newsId),status:'published',department:'',year:0,$or:[{expiresAt:null},{expiresAt:{$gt:now}}]},{projection:{title:1,body:1},maxTimeMS:3000});if(!news)throw new AppError('اختار إعلانًا عامًا منشورًا وغير منتهي.',404);
 const records=await d.collection('push_subscriptions').find({expiresAt:{$gt:now},...(b.after?{_id:{$gt:b.after}}:{})},{maxTimeMS:3000}).sort({_id:1}).limit(51).toArray(),batch=records.slice(0,50);
 const webpush=(await import('web-push')).default;webpush.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
 let sent=0,failed=0,skipped=0;
 for(let offset=0;offset<batch.length;offset+=10)await Promise.all(batch.slice(offset,offset+10).map(async item=>{
   // Revalidate stored endpoints before any outgoing request. Permanent delivery marker prevents duplicate batches.
   let subscription;try{subscription=pushSubscription(item.subscription);}catch{failed++;return;}
   try{await d.collection('push_deliveries').insertOne({_id:digest(`${b.newsId}:${item._id}`),createdAt:now,expiresAt:new Date(now.valueOf()+90*86400000)});}catch(e){if(e.code===11000){skipped++;return;}throw e;}
   try{await webpush.sendNotification(subscription,JSON.stringify({title:news.title,body:news.body.slice(0,200),path:`/news/${b.newsId}`,tag:`news-${b.newsId}`}),{TTL:3600,timeout:3000});sent++;}
   catch(e){failed++;if([404,410].includes(e.statusCode))await d.collection('push_subscriptions').deleteOne({_id:item._id});}
 }));
 return {sent,failed,skipped,next:records.length>50?batch.at(-1)._id:null};
}
