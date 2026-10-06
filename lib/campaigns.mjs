import { AppError,text,choice } from './validation.mjs';
export function campaignInput(b) {
  if(!b || typeof b!=='object' || Array.isArray(b))throw new AppError('بيانات الإعلان غير صحيحة.');
  let url; try {url=new URL(text(b.url,1200));}catch{throw new AppError('الرابط غير صحيح.');}
  if(url.protocol!=='https:' || url.username || url.password || url.port || !url.hostname.includes('.') || url.hostname==='localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) throw new AppError('استخدم رابط HTTPS عام بدون بيانات دخول.');
  const startsAt=new Date(b.startsAt||Date.now()),endsAt=b.endsAt?new Date(b.endsAt):null;
  if(Number.isNaN(startsAt.valueOf()) || (endsAt && (Number.isNaN(endsAt.valueOf()) || endsAt<=startsAt))) throw new AppError('راجع بداية ونهاية الحملة.');
  return { title:text(b.title,120),description:text(b.description||'',250,false),label:text(b.label||'اعرف أكتر',40),url:url.href,slot:choice(b.slot,['home','footer']),status:choice(b.status,['draft','published','archived']),startsAt,endsAt };
}
