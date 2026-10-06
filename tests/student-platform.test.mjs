import test,{before,after,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir,writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {ObjectId} from 'mongodb';
import {hashPassword,digest} from '../lib/security.mjs';
import {institutionalEmail,studyState,plannerItems} from '../lib/student-data.mjs';
import {activityDelta,cairoDay,splitDays,safeEvent} from '../lib/activity-data.mjs';
import {pushSubscription} from '../lib/push-data.mjs';
import {jsonLd,pageMetadata} from '../lib/seo.mjs';
import {campaignInput} from '../lib/campaigns.mjs';
let route,documents,jar,hash;
const outfile=fileURLToPath(new URL(`../node_modules/.cache/eia-students-${process.pid}.mjs`,import.meta.url));
const get=(doc,key)=>key.split('.').reduce((v,k)=>v?.[k],doc),equal=(a,b)=>String(a)===String(b);
function matches(doc,filter){return Object.entries(filter).every(([k,v])=>{if(k==='$or')return v.some(f=>matches(doc,f));if(k==='$and')return v.every(f=>matches(doc,f));const value=get(doc,k);if(v&&typeof v==='object'&&!(v instanceof Date)&&!(v instanceof ObjectId))return Object.entries(v).every(([op,w])=>op==='$gt'?value>w:op==='$gte'?value>=w:op==='$lte'?value<=w:op==='$ne'?!equal(value,w):op==='$exists'?(value!==undefined)===w:op==='$in'?w.some(x=>equal(value,x)):false);return equal(value,v);});}
function projection(doc,p){if(!doc)return null;if(!p)return {...doc};if(Object.values(p).includes(1))return Object.fromEntries(Object.entries(doc).filter(([k])=>k==='_id'||p[k]===1));return Object.fromEntries(Object.entries(doc).filter(([k])=>p[k]!==0));}
function database(){return{collection(name){const records=()=>documents[name]||[];const apply=(doc,u,newDoc=false)=>{if(newDoc)Object.assign(doc,u.$setOnInsert);Object.assign(doc,u.$set);for(const[k,n]of Object.entries(u.$inc||{}))doc[k]=(doc[k]||0)+n;for(const[k,n]of Object.entries(u.$max||{}))if(!doc[k]||doc[k]<n)doc[k]=n;for(const k of Object.keys(u.$unset||{}))delete doc[k];for(const[k,value]of Object.entries(u.$addToSet||{})){doc[k]||=[];if(!doc[k].some(v=>equal(v,value)))doc[k].push(value);}};return{
 async findOne(filter,options={}){return projection(records().find(d=>matches(d,filter)),options.projection);},
 find(filter,options={}){let list=records().filter(d=>matches(d,filter)).map(d=>projection(d,options.projection));const cursor={sort(){return cursor;},limit(n){list=list.slice(0,n);return cursor;},async toArray(){return list;}};return cursor;},
 async insertOne(doc){doc._id ??= new ObjectId();if(records().some(d=>equal(d._id,doc._id)||(name==='students'&&d.email===doc.email)))throw Object.assign(new Error('duplicate'),{code:11000});(documents[name]||=[]).push(doc);return{insertedId:doc._id};},
 async updateOne(filter,update,options={}){let doc=records().find(d=>matches(d,filter));const existing=Boolean(doc);if(!doc&&options.upsert){if(records().some(d=>equal(d._id,filter._id)))throw Object.assign(new Error('duplicate'),{code:11000});doc={_id:filter._id};(documents[name]||=[]).push(doc);}if(!doc)return{matchedCount:0};apply(doc,update,!existing);return{matchedCount:existing?1:0,upsertedId:existing?null:doc._id};},
 async findOneAndUpdate(filter,update,options={}){let doc=records().find(d=>matches(d,filter));let before=doc?{...doc}:null;if(!doc&&options.upsert){doc={_id:filter._id};(documents[name]||=[]).push(doc);}if(!doc)return null;apply(doc,update,!before);return options.returnDocument==='after'?{...doc}:before;},
 async deleteOne(filter){const prior=records().length;documents[name]=records().filter(d=>!matches(d,filter));return{deletedCount:prior-documents[name].length};},
 async deleteMany(filter){const prior=records().length;documents[name]=records().filter(d=>!matches(d,filter));return{deletedCount:prior-documents[name].length};},
 async countDocuments(filter){return records().filter(d=>matches(d,filter)).length;},
 aggregate(pipeline){return{async toArray(){return [];}};}
 };}};}
async function request(path,method='GET',body,extra={}){const host=path.startsWith('admin/')||path.startsWith('auth/')?'control.test':'student.test';const response=await route[method](new Request(`http://${host}/api/${path}`,{method,headers:{host,...(method!=='GET'?{origin:`http://${host}`,'content-type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})}),{params:Promise.resolve({path:path.split('/')})});return{status:response.status,data:await response.json()};}
const signup=()=>request('student/register','POST',{name:'طالب اختبار',email:'bis.2410423@eia.edu.eg',password:'fixture-private-student-password',acceptPrivacy:true,role:'owner'});
before(async()=>{
 process.env.ADMIN_HOST='control.test';delete process.env.RESEND_API_KEY;delete process.env.EMAIL_FROM;
 hash=await hashPassword('fixture-private-student-password');
 await mkdir(fileURLToPath(new URL('../node_modules/.cache',import.meta.url)),{recursive:true});
 const result=await build({entryPoints:[fileURLToPath(new URL('../app/api/[...path]/route.js',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',external:['mongodb','web-push','sharp'],plugins:[{name:'student-boundaries',setup(b){b.onResolve({filter:/db\.mjs$/},()=>({path:'db',namespace:'test'}));b.onResolve({filter:/^web-push$/},()=>({path:'webpush',namespace:'push-test'}));b.onLoad({filter:/.*/,namespace:'push-test'},()=>({contents:'export default {setVapidDetails(){},async sendNotification(...args){return globalThis.__pushSend(...args)}}'}));b.onResolve({filter:/^next\/headers$/},()=>({path:'cookies',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},({path})=>({contents:path==='db'?'export async function db(){return globalThis.__studentDB}':'export async function cookies(){return globalThis.__studentJar}'}));}}]});
 await writeFile(outfile,result.outputFiles[0].contents);route=await import(outfile);
});
beforeEach(()=>{documents={};jar=new Map();globalThis.__studentDB=database();globalThis.__studentJar={get:name=>jar.has(name)?{value:jar.get(name).value}:undefined,set(name,value,options){jar.set(name,{value,options});},delete(name){jar.delete(name);}};});
after(async()=>{await unlink(outfile);delete globalThis.__studentDB;delete globalThis.__studentJar;});
function seedStudent(){const user={_id:new ObjectId(),email:'bis.2410423@eia.edu.eg',name:'طالب اختبار',passwordHash:hash,active:true,authVersion:0,emailVerified:false};documents.students=[user];const raw='c'.repeat(64);jar.set('eia_student',{value:raw});documents.student_sessions=[{_id:digest(raw),studentId:user._id,authVersion:0,lastSeenAt:new Date(),expiresAt:new Date(Date.now()+3600000)}];return user;}

test('Institutional addresses are normalized and spoofed domains are rejected',()=>{assert.equal(institutionalEmail(' BIS.2410423@EIA.EDU.EG '),'bis.2410423@eia.edu.eg');for(const mail of ['bis.2410423@eia.edu.eg.evil','bis@evil.test','x@eia.edu.eg@evil.test'])assert.throws(()=>institutionalEmail(mail));});
test('Study state and planner strip unknown fields and bound content',()=>{const state=studyState({profile:{department:'bis',year:3,term:1,academicYear:'2026/2027',group:'A',role:'owner'},saved:['a'.repeat(24),'a'.repeat(24)],completed:[],role:'owner'});assert.equal(state.role,undefined);assert.equal(state.profile.role,undefined);assert.equal(state.saved.length,1);assert.throws(()=>plannerItems([{id:'abcdefgh',title:'x',date:'2026-02-30'}]));assert.throws(()=>studyState({...state,saved:['$where']}));});
test('Registration creates an unverified student and never an administrator',async()=>{const r=await signup();assert.equal(r.status,200);assert.equal(r.data.user.role,'student');assert.equal(r.data.user.emailVerified,false);assert.equal(documents.admins,undefined);assert.ok(documents.students[0].passwordHash.startsWith('scrypt$65536$'));assert.doesNotMatch(JSON.stringify(r.data),/passwordHash|authVersion|verificationHash/);const s=await request('student/session');assert.equal(s.data.user.emailVerified,false);});
test('Signup privacy acceptance and email domain are required',async()=>{assert.equal((await request('student/register','POST',{name:'x',email:'x@evil.test',password:'fixture-private-student-password',acceptPrivacy:true})).status,400);assert.equal((await request('student/register','POST',{name:'x',email:'x@eia.edu.eg',password:'fixture-private-student-password'})).status,400);assert.equal((documents.students||[]).length,0);});
test('Student cookie cannot authorize control APIs even with its raw token in an admin cookie',async()=>{seedStudent();assert.equal((await request('admin/overview')).status,401);jar.set('eia_session',{value:jar.get('eia_student').value});assert.equal((await request('admin/settings')).status,401);});
test('Revoked, idle and auth-version-changed student sessions fail closed',async()=>{const u=seedStudent();u.authVersion=1;assert.equal((await request('student/planner')).status,401);u.authVersion=0;documents.student_sessions[0].lastSeenAt=new Date(Date.now()-31*60000);assert.equal((await request('student/planner')).status,401);documents.student_sessions=[];assert.equal((await request('student/planner')).status,401);});
test('Study writes belong to the session and reject stale versions',async()=>{const u=seedStudent(),other=new ObjectId();documents.study_states=[{_id:other,version:0,saved:['b'.repeat(24)]}];const value={version:0,studentId:String(other),profile:{department:'bis',year:3,term:1,academicYear:'2026/2027',group:''},saved:['a'.repeat(24)],completed:[]};assert.equal((await request('student/state','PUT',value)).status,200);assert.equal(documents.study_states.find(x=>equal(x._id,u._id)).version,1);assert.deepEqual(documents.study_states.find(x=>equal(x._id,other)).saved,['b'.repeat(24)]);assert.equal((await request('student/state','PUT',value)).status,409);});
test('Private planner is account-scoped and cannot overwrite another account',async()=>{const u=seedStudent(),other=new ObjectId();documents.study_plans=[{_id:other,version:1,items:[{title:'Private'}]}];const r=await request('student/planner','PUT',{version:0,studentId:String(other),items:[{id:'abcdefgh',title:'مذاكرة',date:'2026-10-07',done:false}]});assert.equal(r.status,200);assert.equal(documents.study_plans.find(x=>equal(x._id,u._id)).items[0].title,'مذاكرة');assert.equal(documents.study_plans.find(x=>equal(x._id,other)).items[0].title,'Private');assert.equal((await request('student/planner','PUT',{version:0,items:[]})).status,409);});
test('Unconfigured email never marks a student as verified or exposes a code',async()=>{seedStudent();const r=await request('student/verification','POST',{});assert.equal(r.status,503);assert.equal(documents.students[0].emailVerified,false);assert.equal(documents.students[0].verificationHash,undefined);assert.equal((await request('student/session')).data.emailVerificationAvailable,false);});
test('Wrong-password login stays generic; success rotates and binds a browser',async()=>{seedStudent();const old=jar.get('eia_student').value;const wrong=await request('student/login','POST',{email:'bis.2410423@eia.edu.eg',password:'wrong-password'});assert.equal(wrong.status,401);assert.equal(jar.get('eia_student').value,old);const good=await request('student/login','POST',{email:'bis.2410423@eia.edu.eg',password:'fixture-private-student-password'});assert.equal(good.status,200);assert.notEqual(jar.get('eia_student').value,old);assert.equal(documents.student_device_links.length,1);});
test('Password change requires reauthentication and revokes the other sessions',async()=>{const u=seedStudent();documents.student_sessions.push({...documents.student_sessions[0],_id:'other-session'});assert.equal((await request('student/password','POST',{currentPassword:'wrong',password:'next-private-student-password'})).status,401);assert.equal(documents.student_sessions.length,2);assert.equal((await request('student/password','POST',{currentPassword:'fixture-private-student-password',password:'next-private-student-password'})).status,200);assert.equal(documents.students[0].authVersion,1);assert.equal(documents.student_sessions.length,1);assert.equal((await request('student/session')).data.user._id,String(u._id));});
test('Telemetry does nothing without consent and opt-out stops further writes',async()=>{assert.deepEqual((await request('telemetry/pulse','POST',{visible:true,active:true})).data,{enabled:false});assert.equal(documents.activity_sessions,undefined);assert.equal((await request('telemetry/consent','POST',{enabled:true})).status,200);const tracked=documents.activity_sessions[0];tracked.lastPulseAt=new Date(Date.now()-15000);tracked.visible=true;tracked.active=true;assert.equal((await request('telemetry/pulse','POST',{visible:true,active:true})).status,200);assert.ok(tracked.foregroundMs>=14000&&tracked.foregroundMs<=20000);assert.equal(tracked.activeMs,tracked.foregroundMs);assert.equal(documents.activity_daily.length,1);await request('telemetry/consent','POST',{enabled:false});const before=tracked.foregroundMs;assert.equal((await request('telemetry/pulse','POST',{visible:true,active:true})).data.enabled,false);assert.equal(tracked.foregroundMs,before);assert.equal(tracked.consent,false);});
test('Visible, idle, hidden and long-gap time have distinct bounded accounting',()=>{const now=Date.now();assert.deepEqual(activityDelta({lastPulseAt:now-15000,visible:true,active:false},{visible:true,active:false},now),{foregroundMs:15000,activeMs:0,visible:true,active:false});assert.equal(activityDelta({lastPulseAt:now-15000,visible:false,active:true},{visible:true,active:true},now).foregroundMs,0);assert.equal(activityDelta({lastPulseAt:now-600000,visible:true,active:true},{visible:true,active:true},now).activeMs,0);assert.equal(activityDelta({lastPulseAt:now-30000,visible:true,active:true},{visible:true,active:true},now).activeMs,20000);assert.throws(()=>activityDelta({},{visible:'yes',active:true},now));});
test('Cairo daily boundaries split measured time across midnight',()=>{const end=Date.parse('2026-10-06T21:00:05Z'),start=end-10000;assert.equal(cairoDay(end),'2026-10-07');assert.equal(cairoDay(start),'2026-10-06');const parts=splitDays(start,end,10000,10000);assert.equal(parts.length,2);assert.equal(parts[0].foregroundMs,5000);assert.equal(parts[1].foregroundMs,5000);assert.equal(parts.reduce((n,x)=>n+x.activeMs,0),10000);});
test('Event schema excludes URLs, searches and arbitrary identity payloads',()=>{assert.deepEqual(safeEvent({type:'view',target:'library',email:'secret'}),{type:'view',target:'library'});assert.throws(()=>safeEvent({type:'view',target:'https://secret.test?mail=x'}));assert.throws(()=>safeEvent({type:'fingerprint',target:'canvas'}));});
test('Campaign schema rejects scripts, credentials and reversed schedules',()=>{const b={title:'x',url:'https://eia.edu.eg/',slot:'home',status:'published',startsAt:'2026-10-06',endsAt:'2026-10-07'};assert.ok(campaignInput(b).startsAt instanceof Date);assert.throws(()=>campaignInput({...b,url:'javascript:alert(1)'}));assert.throws(()=>campaignInput({...b,url:'https://user:pass@eia.edu.eg'}));assert.throws(()=>campaignInput({...b,endsAt:'2026-10-05'}));assert.throws(()=>campaignInput({...b,slot:'popup'}));});

function seedAdmin(role) {
 const user={_id:new ObjectId(),name:'Team fixture',email:'owner@fixture.test',role,active:true,authVersion:0,mfaEnabled:false};
 documents.admins=[user];const raw='d'.repeat(64);jar.set('eia_session',{value:raw});
 documents.sessions=[{_id:digest(raw),adminId:user._id,version:2,authVersion:0,lastSeenAt:new Date(),expiresAt:new Date(Date.now()+3600000)}];return user;
}
test('Metric and campaign permission checks run before data reads, and student directory is owner-only',async()=>{
 seedAdmin('editor');for(const path of ['admin/analytics?days=7','admin/campaigns','admin/students']) {const clean=path.split('?')[0];assert.equal((await request(clean)).status,403);}
 documents.admins[0].role='admin';assert.equal((await request('admin/analytics')).status,200);assert.equal((await request('admin/campaigns')).status,200);assert.equal((await request('admin/students')).status,403);
 documents.admins[0].role='owner';seedStudent();const listed=await request('admin/students');assert.equal(listed.status,200);assert.equal(listed.data.students.length,1);assert.doesNotMatch(JSON.stringify(listed.data),/passwordHash|authVersion|verificationHash|deviceId/);
});
test('Campaign writes remain draft by choice, archive instead of delete, and editors cannot write',async()=>{
 seedAdmin('editor');const body={title:'Study partner',url:'https://eia.edu.eg/',slot:'home',status:'draft'};
 assert.equal((await request('admin/campaigns','POST',body)).status,403);documents.admins[0].role='admin';assert.equal((await request('admin/campaigns','POST',body)).status,200);assert.equal(documents.campaigns[0].status,'draft');
 const id=new ObjectId();documents.campaigns[0]._id=id;assert.equal((await request(`admin/campaigns/${id}`,'DELETE')).status,200);assert.equal(documents.campaigns[0].status,'archived');assert.equal(documents.campaigns.length,1);
});
test('Different accounts on the same browser share only the random browser association',async()=>{
 await signup();const first=documents.students[0],device=jar.get('eia_device').value;
 await request('student/logout','POST',{});const second=await request('student/register','POST',{name:'Another student',email:'bis.2410424@eia.edu.eg',password:'fixture-private-student-password',acceptPrivacy:true});
 assert.equal(second.status,200);assert.equal(jar.get('eia_device').value,device);assert.equal(documents.student_device_links.length,2);assert.equal(documents.student_device_links[0].deviceId,documents.student_device_links[1].deviceId);assert.notEqual(String(documents.student_device_links[1].studentId),String(first._id));
 assert.equal(jar.get('eia_device').options.httpOnly,true);assert.equal(jar.get('eia_device').options.sameSite,'strict');assert.equal(jar.get('eia_device').options.maxAge,90*86400);assert.doesNotMatch(JSON.stringify(second.data),/deviceId|fingerprint/);
 jar.delete('eia_device');await request('student/login','POST',{email:first.email,password:'fixture-private-student-password'});assert.notEqual(jar.get('eia_device').value,device);assert.equal(documents.student_device_links.length,3);
});
test('Passive measurement cannot extend the student idle session',async()=>{
 seedStudent();const last=new Date(Date.now()-10*60000);documents.student_sessions[0].lastSeenAt=last;
 await request('telemetry/consent','POST',{enabled:true});await request('telemetry/pulse','POST',{visible:true,active:true});assert.equal(documents.student_sessions[0].lastSeenAt.valueOf(),last.valueOf());
 documents.activity_sessions[0].createdAt=new Date(Date.now()-9*3600000);assert.deepEqual((await request('telemetry/pulse','POST',{visible:true,active:true})).data,{enabled:false});
});
test('Ad events deduplicate and a click implies an impression, while unpublished ads cannot count',async()=>{
 const id=new ObjectId();documents.campaigns=[{_id:id,status:'published',startsAt:new Date(Date.now()-1000),endsAt:null}];await request('telemetry/consent','POST',{enabled:true});
 for(let i=0;i<2;i++)assert.equal((await request('telemetry/event','POST',{type:'ad_click',target:String(id),email:'ignored'})).status,200);
 assert.equal(documents.activity_events.length,2);assert.deepEqual(documents.activity_events.map(x=>x.type).sort(),['ad_click','ad_impression']);assert.equal(documents.activity_events[0].email,undefined);
 documents.campaigns[0].status='draft';assert.equal((await request('telemetry/event','POST',{type:'ad_click',target:String(id)})).status,404);assert.equal(documents.activity_events.length,2);
});
test('Bounded study state fits the API budget including both progress lists',()=>{
 const ids=Array.from({length:1100},(_,n)=>n.toString(16).padStart(24,'0'));const value={profile:{department:'bis',year:3,term:1},saved:ids,completed:ids};assert.throws(()=>studyState(value));
 const state=studyState({...value,completed:ids.slice(0,900)});assert.ok(Buffer.byteLength(JSON.stringify({...state,version:0}))<65536);
});
test('Configured mail consumes an expiring keyed code and never exposes it through the API',async()=>{
 seedStudent();const oldFetch=globalThis.fetch;let code;
 process.env.RESEND_API_KEY='fixture-mail-key';process.env.EMAIL_FROM='Fixture <study@fixture.test>';process.env.MFA_ENCRYPTION_KEY='fixture-purpose-key';
 globalThis.fetch=async(url,init)=>{assert.equal(url,'https://api.resend.com/emails');const body=JSON.parse(init.body);assert.deepEqual(body.to,['bis.2410423@eia.edu.eg']);code=/[0-9]{6}/.exec(body.text)[0];return {ok:true};};
 try {const sent=await request('student/verification','POST',{});assert.equal(sent.status,200);assert.deepEqual(sent.data,{ok:true});assert.ok(documents.students[0].verificationHash);assert.notEqual(documents.students[0].verificationHash,digest(code));
 assert.equal((await request('student/verification','POST',{code:'000000'})).status,400);documents.students[0].verificationExpiresAt=new Date(Date.now()-1);assert.equal((await request('student/verification','POST',{code})).status,400);
 documents.students[0].verificationExpiresAt=new Date(Date.now()+10000);assert.equal((await request('student/verification','POST',{code})).status,200);assert.equal(documents.students[0].emailVerified,true);assert.equal(documents.students[0].verificationHash,undefined);assert.equal(documents.students[0].verificationExpiresAt,undefined);
 assert.deepEqual((await request('student/verification','POST',{code})).data,{ok:true});assert.equal(documents.admins,undefined);
 }finally{globalThis.fetch=oldFetch;delete process.env.RESEND_API_KEY;delete process.env.EMAIL_FROM;delete process.env.MFA_ENCRYPTION_KEY;}
});
test('Failed mail removes only the issued challenge and preserves unverified status',async()=>{
 seedStudent();const oldFetch=globalThis.fetch;process.env.RESEND_API_KEY='fixture-key';process.env.EMAIL_FROM='study@fixture.test';process.env.MFA_ENCRYPTION_KEY='fixture-purpose-key';globalThis.fetch=async()=>({ok:false});
 try{assert.equal((await request('student/verification','POST',{})).status,503);assert.equal(documents.students[0].emailVerified,false);assert.equal(documents.students[0].verificationHash,undefined);}finally{globalThis.fetch=oldFetch;delete process.env.RESEND_API_KEY;delete process.env.EMAIL_FROM;delete process.env.MFA_ENCRYPTION_KEY;}
});

const pushValue=()=>({endpoint:'https://fcm.googleapis.com/fcm/send/fixture-endpoint',keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64,7)]).toString('base64url'),auth:Buffer.alloc(16,8).toString('base64url')}});
test('Push endpoint validation refuses SSRF, lookalikes and malformed keys',()=>{
 assert.equal(pushSubscription(pushValue()).endpoint,pushValue().endpoint);
 for(const endpoint of ['http://fcm.googleapis.com/fcm/send/x','https://127.0.0.1/a','https://fcm.googleapis.com.evil/fcm/send/x','https://user:pass@fcm.googleapis.com/fcm/send/x','https://fcm.googleapis.com:444/fcm/send/x','https://fcm.googleapis.com/fcm/send/x?url=evil'])assert.throws(()=>pushSubscription({...pushValue(),endpoint}));
 assert.throws(()=>pushSubscription({...pushValue(),keys:{p256dh:'wrong',auth:'wrong'}}));
});
test('Push subscriptions require configured delivery and are scoped to their opaque browser cookie',async()=>{
 assert.equal((await request('push/config')).data.available,false);assert.equal((await request('push/subscribe','POST',{subscription:pushValue()})).status,503);
 process.env.VAPID_PUBLIC_KEY='fixture-public';process.env.VAPID_PRIVATE_KEY='fixture-private';process.env.VAPID_SUBJECT='https://fixture.test/about';
 try{assert.equal((await request('push/subscribe','POST',{subscription:pushValue()})).status,200);assert.equal(jar.get('eia_push').options.httpOnly,true);assert.equal(documents.push_subscriptions.length,1);jar.delete('eia_push');assert.equal((await request('push/subscribe','POST',{subscription:pushValue()})).status,409);assert.equal(documents.push_subscriptions.length,1);}finally{delete process.env.VAPID_PUBLIC_KEY;delete process.env.VAPID_PRIVATE_KEY;delete process.env.VAPID_SUBJECT;}
});
test('Push sending is role-gated, general published-news only and deduplicated',async()=>{
 const news={_id:new ObjectId(),title:'General notice',body:'Study update',status:'published',department:'',year:0,expiresAt:null};documents.news=[news];documents.push_subscriptions=[{_id:'a'.repeat(64),subscription:pushValue(),expiresAt:new Date(Date.now()+10000)}];seedAdmin('editor');assert.equal((await request('admin/notifications','POST',{newsId:String(news._id)})).status,403);
 process.env.VAPID_PUBLIC_KEY='fixture-public';process.env.VAPID_PRIVATE_KEY='fixture-private';process.env.VAPID_SUBJECT='https://fixture.test/about';let calls=0;globalThis.__pushSend=async()=>{calls++;};
 try{documents.admins[0].role='admin';const a=await request('admin/notifications','POST',{newsId:String(news._id)});assert.equal(a.status,200);assert.equal(a.data.sent,1);assert.equal((await request('admin/notifications','POST',{newsId:String(news._id)})).data.skipped,1);assert.equal(calls,1);news.department='bis';assert.equal((await request('admin/notifications','POST',{newsId:String(news._id)})).status,404);assert.equal(calls,1);}finally{delete process.env.VAPID_PUBLIC_KEY;delete process.env.VAPID_PRIVATE_KEY;delete process.env.VAPID_SUBJECT;delete globalThis.__pushSend;}
});
test('Discovery metadata has canonical URLs and script-safe structured data',()=>{
 assert.equal(pageMetadata('Title','Desc','/library').alternates.canonical,'https://eia-platform-chi.vercel.app/library');assert.doesNotMatch(jsonLd({name:'</script><script>bad'}),/</);assert.equal(JSON.parse(jsonLd({name:'</script>'})).name,'</script>');
});

test('Private profile fields are bounded, versioned and cannot grant roles or change institutional email',async()=>{
 const user=seedStudent();const r=await request('student/profile','PUT',{version:0,name:'اسم جديد',phone:'+201012345678',studentCode:'2410423',city:'الإسكندرية',bio:'طالب نظم',role:'owner',email:'owner@evil.test'});
 assert.equal(r.status,200);assert.equal(documents.students[0].role,undefined);assert.equal(documents.students[0].email,'bis.2410423@eia.edu.eg');assert.equal(documents.students[0].personal.phone,'+201012345678');
 assert.equal((await request('student/profile','PUT',{version:0,name:'stale'})).status,409);
 assert.equal((await request('student/profile','PUT',{version:1,name:'x',phone:'not a number'})).status,400);
 const snapshot=await request('student/session');assert.equal(snapshot.data.user.personal.studentCode,'2410423');assert.equal(snapshot.data.user.profileVersion,1);
 documents.student_sessions=[];assert.equal((await request('student/profile','PUT',{version:1,name:'x'})).status,401);
});
test('Login and preference restoration cannot create analytic consent; explicit choice persists and opt-out gates events',async()=>{
 const user=seedStudent();assert.equal((await request('telemetry/consent','POST',{enabled:true,restore:true})).data.enabled,false);assert.equal(user.analyticsConsent,undefined);
 await request('telemetry/consent','POST',{enabled:true});assert.equal(user.analyticsConsent,true);
 await request('telemetry/consent','POST',{enabled:false});assert.equal(user.analyticsConsent,false);assert.equal((await request('telemetry/pulse','POST',{visible:true,active:true})).data.enabled,false);
});
test('Ad requests stay private, accept only the student-owned identity and require review consent',async()=>{
 const user=seedStudent(),value={business:'Project',contact:'contact@example.test',title:'Sponsored',description:'Details',url:'https://eia.edu.eg/',slot:'home',acceptReview:true,studentId:'other',status:'published',weight:10};
 assert.equal((await request('student/ad-requests','POST',{...value,acceptReview:false})).status,400);
 assert.equal((await request('student/ad-requests','POST',value)).status,200);const record=documents.ad_requests[0];assert.equal(record.status,'pending');assert.equal(String(record.studentId),String(user._id));assert.equal(record.weight,1);assert.equal(documents.campaigns,undefined);
 const other=seedStudent();assert.notEqual(String(other._id),String(user._id));assert.equal((await request('student/ad-requests')).data.requests.length,0);
 seedAdmin('editor');assert.equal((await request('admin/ad-requests')).status,403);
});
test('Ad review creates an idempotent draft and rejects competing decisions instead of publishing silently',async()=>{
 seedStudent();const value={business:'Project',contact:'contact@example.test',title:'Sponsored',url:'https://eia.edu.eg/',slot:'home',acceptReview:true};await request('student/ad-requests','POST',value);const item=documents.ad_requests[0];
 seedAdmin('admin');const path=`admin/ad-requests/${item._id}`;
 assert.equal((await request(path,'PUT',{action:'approve',version:1})).status,200);assert.equal(documents.campaigns.length,1);assert.equal(documents.campaigns[0].status,'draft');assert.equal(documents.campaigns[0].contact,undefined);assert.equal(documents.campaigns[0].applicantEmail,undefined);
 assert.equal((await request(path,'PUT',{action:'approve',version:1})).status,200);assert.equal(documents.campaigns.length,1);
 assert.equal((await request(path,'PUT',{action:'reject',version:1})).status,409);
});
test('Creative references cannot reuse another student private asset and public projection strips creative secrets',async()=>{
 const user=seedStudent(),id=new ObjectId();documents.ad_media=[{_id:id,ownerId:new ObjectId(),kind:'banner',expiresAt:new Date(Date.now()+10000)}];
 assert.equal((await request('student/ad-requests','POST',{business:'x',contact:'x',title:'x',url:'https://eia.edu.eg/',slot:'home',acceptReview:true,banner:{kind:'upload',id:String(id)}})).status,400);
 documents.ad_media[0].ownerId=user._id;assert.equal((await request('student/ad-requests','POST',{business:'x',contact:'x',title:'x',url:'https://eia.edu.eg/',slot:'home',acceptReview:true,banner:{kind:'upload',id:String(id)}})).status,200);
});
test('Measured ad deliveries need consent, a live campaign and a matching impression, and duplicate clicks do not increment',async()=>{
 seedStudent();const id=new ObjectId(),uuid='12345678-1234-1234-1234-123456789abc',value={target:String(id),requestId:uuid};documents.campaigns=[{_id:id,status:'published',startsAt:new Date(Date.now()-1000),endsAt:null}];
 assert.equal((await request('telemetry/ad-view','POST',value)).data.enabled,false);await request('telemetry/consent','POST',{enabled:true});
 assert.equal((await request('telemetry/ad-click','POST',value)).data.counted,false);await request('telemetry/ad-view','POST',value);await request('telemetry/ad-view','POST',value);assert.equal(documents.ad_deliveries.length,1);
 assert.equal((await request('telemetry/ad-click','POST',value)).data.counted,true);assert.equal((await request('telemetry/ad-click','POST',value)).data.counted,false);
 documents.campaigns[0].status='archived';assert.equal((await request('telemetry/ad-view','POST',{...value,requestId:'12345678-1234-1234-1234-123456789def'})).status,404);
});

test('Raster uploads are reencoded, private before publication, and never accept executable SVG',async()=>{
 const user=seedStudent(),sharp=(await import('sharp')).default;
 const png=await sharp({create:{width:40,height:40,channels:3,background:'#684fa3'}}).png().toBuffer();
 const send=async(bytes,name,type)=>{const form=new FormData();form.set('kind','icon');form.set('file',new File([bytes],name,{type}));return route.POST(new Request('http://student.test/api/student/ad-media',{method:'POST',headers:{host:'student.test',origin:'http://student.test'},body:form}),{params:Promise.resolve({path:['student','ad-media']})});};
 const response=await send(png,'test.png','image/png');assert.equal(response.status,201);const body=await response.json();assert.equal(body.image.kind,'upload');assert.equal(documents.ad_media.length,1);
 const record=documents.ad_media[0],meta=await sharp(record.data.buffer).metadata();assert.equal(meta.format,'webp');assert.equal(meta.exif,undefined);assert.equal(record.ownerArea,'student');
 const privateRead=await route.GET(new Request(`http://student.test/api/student/ad-media/${record._id}`,{headers:{host:'student.test'}}),{params:Promise.resolve({path:['student','ad-media',String(record._id)]})});assert.equal(privateRead.status,200);assert.equal(privateRead.headers.get('content-type'),'image/webp');
 assert.equal((await request(`public/ad-media/${record._id}`)).status,404);
 assert.equal((await send('<svg><script>alert(1)</script></svg>','fake.png','image/png')).status,400);
 seedStudent();assert.equal((await request(`student/ad-media/${record._id}`)).status,404);
});
