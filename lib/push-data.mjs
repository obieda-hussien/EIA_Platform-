import {AppError} from './validation.mjs';
export function pushSubscription(value){
 let url;try{url=new URL(value.endpoint);}catch{throw new AppError('عنوان الاشتراك غير صحيح.');}
 const paths={'fcm.googleapis.com':['/fcm/send/','/wp/'],'updates.push.services.mozilla.com':['/wpush/'],'web.push.apple.com':['/']};
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||url.search||url.href.length>2000||!paths[url.hostname]?.some(p=>url.pathname.startsWith(p))||url.pathname.length<10)throw new AppError('خدمة الإشعارات غير مدعومة.');
 const {p256dh,auth}=value.keys||{};
 if(!/^[A-Za-z0-9_-]{86,88}$/.test(p256dh||'')||! /^[A-Za-z0-9_-]{22,24}$/.test(auth||'')||Buffer.from(p256dh,'base64url').length!==65||Buffer.from(p256dh,'base64url')[0]!==4||Buffer.from(auth,'base64url').length!==16)throw new AppError('مفاتيح الاشتراك غير صحيحة.');
 return {endpoint:url.href,keys:{p256dh,auth}};
}
