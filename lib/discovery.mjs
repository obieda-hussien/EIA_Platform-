import 'server-only';
import {cache} from 'react';
import {ObjectId} from 'mongodb';
import {db} from './db.mjs';
import {publicProjection,publicDocument} from './public-data.mjs';
const safe=doc=>JSON.parse(JSON.stringify(doc));
export const readEntry=cache(async(type,key)=>{
 if(!['subjects','resources','news'].includes(type)||!/^[a-f0-9]{24}$/.test(key))return null;
 const d=await db(),filter={_id:ObjectId.createFromHexString(key),...(type==='subjects'?{active:true}:{status:'published'}),...(type==='news'?{$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]}:{})};
 const doc=await d.collection(type).findOne(filter,{projection:publicProjection(type),maxTimeMS:3000});if(!doc)return null;
 if(type==='resources'&&!await d.collection('subjects').findOne({_id:doc.subjectId,active:true},{projection:{_id:1},maxTimeMS:3000}))return null;
 return safe(publicDocument(type,doc));
});
export const readDiscovery=cache(async(subjectId)=>{
 const d=await db();const subjects=await d.collection('subjects').find({active:true},{projection:publicProjection('subjects'),maxTimeMS:3000}).sort({name:1}).limit(1000).toArray();
 const ids=subjects.map(s=>s._id);const selected=subjectId?ids.filter(id=>String(id)===subjectId):ids;
 const [resources,news]=await Promise.all([d.collection('resources').find({status:'published',subjectId:{$in:selected}},{projection:publicProjection('resources'),maxTimeMS:3000}).sort({createdAt:-1}).limit(subjectId?150:60).toArray(),d.collection('news').find({status:'published',$or:[{expiresAt:null},{expiresAt:{$gt:new Date()}}]},{projection:publicProjection('news'),maxTimeMS:3000}).sort({createdAt:-1}).limit(30).toArray()]);
 return safe({subjects:subjects.map(s=>publicDocument('subjects',s)),resources:resources.map(s=>publicDocument('resources',s)),news:news.map(s=>publicDocument('news',s))});
});
