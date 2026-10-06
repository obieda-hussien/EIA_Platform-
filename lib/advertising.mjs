import {db} from './db.mjs';
import {studentSession} from './student.mjs';
import {session,throttle,audit} from './session.mjs';
import {AppError,choice,text,integer} from './validation.mjs';
import {adRequestInput,campaignInput} from './campaigns.mjs';
import {readLimited} from './http.mjs';
import {ObjectId,Binary} from 'mongodb';
import sharp from 'sharp';
const objectId=value=>{if(!/^[a-f0-9]{24}$/.test(value||''))throw new AppError('معرّف غير صحيح.');return new ObjectId(value);};
const running=()=>({status:'published',startsAt:{$lte:new Date()},$or:[{endsAt:null},{endsAt:{$gt:new Date()}}]});
const responseImage=item=>new Response(new Uint8Array(item.data.buffer),{headers:{'Content-Type':'image/webp','Content-Length':String(item.bytes),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"sandbox; default-src 'none'"}});
export async function validateCreativeOwnership(data,owner,admin=false) {
 const d=await db();
 for(const kind of ['icon','banner'])if(data[kind]?.kind==='upload'){
  const image=await d.collection('ad_media').findOne({_id:objectId(data[kind].id),kind,...(!admin?{ownerId:owner}:{}),$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]},{projection:{_id:1},maxTimeMS:3000});
  if(!image)throw new AppError('الصورة غير متاحة أو ليست من ملفاتك. ارفعها مجددًا.',400);
 }
}
export async function retainCampaignMedia(data) {
 if(data.status!=='published')return;
 const d=await db();for(const kind of ['icon','banner'])if(data[kind]?.kind==='upload')await d.collection('ad_media').updateOne({_id:objectId(data[kind].id)},{$unset:{expiresAt:''}});
}
export async function adMedia(req,area,record,source) {
 let user;
 if(area==='admin'){user=await session();if(user.role==='editor')throw new AppError('متاحة للأدمن والمالك فقط.',403);}
 else if(area==='student')user=await studentSession();
 const d=await db();
 if(req.method==='GET'){
  const _id=objectId(record);
  if(area==='public'&&!await d.collection('campaigns').findOne({...running(),$and:[{$or:[{'icon.id':record},{'banner.id':record}]}]},{projection:{_id:1},maxTimeMS:3000}))throw new AppError('الصورة غير متاحة.',404);
  const image=await d.collection('ad_media').findOne({_id,...(area==='student'?{ownerId:user._id,ownerArea:'student'}:{})},{maxTimeMS:3000});
  if(!image||(image.expiresAt&&image.expiresAt<=new Date()))throw new AppError('الصورة غير متاحة.',404);
  return responseImage(image);
 }
 if(!user)throw new AppError('سجّل الدخول.',401);
 await throttle(`ad-upload:${user._id}`,3,60000);await throttle(`ad-upload-hour:${user._id}`,20,3600000);
 const active={$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]};
 if(await d.collection('ad_media').countDocuments(active)>=250||await d.collection('ad_media').countDocuments({...active,ownerId:user._id,ownerArea:area})>=(area==='admin'?160:20))throw new AppError('مساحة الصور المتاحة ممتلئة. جرّب رابط صورة مباشر.',429);
 if(!req.headers.get('content-type')?.startsWith('multipart/form-data'))throw new AppError('استخدم رفع صورة.',415);
 const bytes=await readLimited(req,1024*1024+65536,15000);let form;try{form=await new Response(bytes,{headers:{'content-type':req.headers.get('content-type')}}).formData();}catch{throw new AppError('بيانات رفع الصورة غير صحيحة.');}
 const kind=choice(form.get('kind'),['icon','banner']),file=form.get('file');if(!file||typeof file==='string'||!file.size||file.size>1024*1024)throw new AppError('اختار صورة بحد أقصى ١ ميجابايت.');
 const input=Buffer.from(await file.arrayBuffer());
 const raster=(input.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||input.subarray(0,3).equals(Buffer.from([255,216,255]))||(input.subarray(0,4).toString()==='RIFF'&&input.subarray(8,12).toString()==='WEBP'));
 if(!raster)throw new AppError('الرفع متاح لصور PNG وJPEG وWebP فقط.');
 let output;try{
  const pipeline=sharp(input,{limitInputPixels:12000000,animated:false,failOn:'warning'}),meta=await pipeline.metadata();
  if(!['png','jpeg','webp'].includes(meta.format)||(meta.pages||1)>1)throw new Error('unsupported');
  output=await pipeline.rotate().resize(kind==='icon'?160:960,kind==='icon'?160:360,{fit:'cover',withoutEnlargement:true}).webp({quality:78,effort:3}).toBuffer({resolveWithObject:true});
 }catch{throw new AppError('الصورة تالفة أو كبيرة جدًا عند فكّها.');}
 if(output.data.length>256000)throw new AppError('اختار صورة أبسط؛ الحجم المضغوط أكبر من الحد.');
 const _id=new ObjectId(),now=new Date();await d.collection('ad_media').insertOne({_id,ownerArea:area,ownerId:user._id,kind,data:new Binary(output.data),bytes:output.data.length,width:output.info.width,height:output.info.height,createdAt:now,expiresAt:new Date(now.valueOf()+90*86400000)});
 return Response.json({image:{kind:'upload',id:String(_id)},bytes:output.data.length},{status:201,headers:{'Cache-Control':'private, no-store'}});
}
export async function adRequests(req,area,record,readBody,source) {
 const user=area==='student'?await studentSession():await session(),d=await db();
 if(area==='admin'&&user.role==='editor')throw new AppError('متاحة للأدمن والمالك فقط.',403);
 if(req.method==='GET')return {requests:await d.collection('ad_requests').find(area==='student'?{studentId:user._id}:{},{projection:{reviewedBy:0},maxTimeMS:3000}).sort({createdAt:-1}).limit(area==='student'?30:100).toArray()};
 const b=await readBody(req);
 if(area==='student'){
  await throttle(`ad-request:${user._id}`,5,86400000);await throttle(`ad-request-ip:${source}`,20,86400000);
  if(b.acceptReview!==true)throw new AppError('وافق على مشاركة تفاصيل الطلب مع فريق مراجعة الإعلانات.');
  const value=adRequestInput(b);await validateCreativeOwnership(value,user._id);
  const _id=new ObjectId();await d.collection('ad_requests').insertOne({_id,...value,studentId:user._id,applicantName:user.name,applicantEmail:user.email,status:'pending',reviewConsentAt:new Date(),createdAt:new Date(),expiresAt:new Date(Date.now()+180*86400000),version:1});
  return {ok:true,id:String(_id)};
 }
 const _id=objectId(record),action=choice(b.action,['approve','reject']),version=integer(b.version,1,1000000000),reason=text(b.reason||'',500,false);
 let item=await d.collection('ad_requests').findOne({_id},{maxTimeMS:3000});if(!item)throw new AppError('الطلب غير موجود.',404);
 // Approval is an atomic transition. Deterministic campaign ID makes recovery idempotent.
 if(action==='approve'){await validateCreativeOwnership(item,item.studentId,true);if(!await d.collection('campaigns').findOne({_id},{projection:{_id:1}})&&await d.collection('campaigns').countDocuments({status:{$ne:'archived'}})>=80)throw new AppError('أرشف حملات قديمة قبل تجهيز حملة جديدة.');}
 if(item.status==='pending'){
  const updated=await d.collection('ad_requests').findOneAndUpdate({_id,status:'pending',version},{$set:{status:action==='approve'?'approved':'rejected',reviewReason:reason,reviewedAt:new Date(),reviewedBy:user.email},$inc:{version:1}},{returnDocument:'after'});
  if(!updated)throw new AppError('الطلب اتراجع من أدمن آخر. حدّث القائمة.',409);item=updated;
 }else if(!(action==='approve'&&item.status==='approved'&&(item.version===version||item.version===version+1)))throw new AppError('الطلب اتراجع بالفعل. حدّث القائمة.',409);
 if(action==='approve'){
  await validateCreativeOwnership(item,item.studentId,true);
  const creative=campaignInput({...item,status:'draft',startsAt:new Date(),endsAt:null});
  await d.collection('campaigns').updateOne({_id},{$setOnInsert:{...creative,_id,status:'draft',startsAt:new Date(),endsAt:null,requestId:_id,createdAt:new Date(),updatedAt:new Date()}},{upsert:true});
 }
 await audit(user,action,'ad_requests',_id);return {ok:true,campaignId:action==='approve'?String(_id):null};
}
