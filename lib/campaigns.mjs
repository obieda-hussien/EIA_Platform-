import { AppError,text,choice,integer,DEPARTMENTS } from './validation.mjs';
import {isIP} from 'node:net';
export function publicHttps(value) {
 let url;try{url=new URL(text(value,1200));}catch{throw new AppError('الرابط غير صحيح.');}
 if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.includes('.')||isIP(url.hostname.replace(/^\[|\]$/g,''))||/^(localhost|.*\.(local|internal|localhost))$/.test(url.hostname))throw new AppError('استخدم رابط HTTPS عام بدون بيانات دخول.');
 return url.href;
}
export function creative(value) {
 if(!value)return null;
 if(value.kind==='upload'&&/^[a-f0-9]{24}$/.test(value.id||''))return {kind:'upload',id:value.id};
 if(value.kind==='url'){const url=publicHttps(value.url);if(!/\.(png|jpe?g|webp)$/i.test(new URL(url).pathname))throw new AppError('رابط الصورة يجب أن ينتهي بـ PNG أو JPG أو WebP.');return {kind:'url',url};}
 throw new AppError('مصدر الصورة غير صحيح.');
}
export function campaignInput(b) {
 if(!b||typeof b!=='object'||Array.isArray(b))throw new AppError('بيانات الإعلان غير صحيحة.');
 const startsAt=new Date(b.startsAt||Date.now()),endsAt=b.endsAt?new Date(b.endsAt):null;
 if(Number.isNaN(startsAt.valueOf())||(endsAt&&(Number.isNaN(endsAt.valueOf())||endsAt<=startsAt)))throw new AppError('راجع بداية ونهاية الحملة.');
 return {title:text(b.title,120),description:text(b.description||'',250,false),label:text(b.label||'اعرف أكتر',40),url:publicHttps(b.url),slot:choice(b.slot,['home','footer']),status:choice(b.status,['draft','published','archived']),startsAt,endsAt,icon:creative(b.icon),banner:creative(b.banner),weight:integer(b.weight??1,1,10),frequencyCap:integer(b.frequencyCap??5,1,30),department:choice(b.department||'',['',...DEPARTMENTS.map(d=>d.id)]),year:integer(b.year??0,0,4)};
}
export function adRequestInput(b) {
 const value=campaignInput({...b,status:'draft',startsAt:new Date(),endsAt:null,weight:1,frequencyCap:5,department:'',year:0});
 return {...value,business:text(b.business,100),contact:text(b.contact,150),notes:text(b.notes||'',600,false)};
}
