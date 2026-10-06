// Anonymous in-memory session pacing; no persistent device fingerprint or account identifiers.
export function eligibleAds(campaigns,slot,profile,now=Date.now()) {
 return campaigns.filter(c=>c.slot===slot&&(!c.startsAt||new Date(c.startsAt).valueOf()<=now)&&(!c.endsAt||new Date(c.endsAt).valueOf()>now)&&(!c.department||c.department===profile?.department)&&(!c.year||c.year===Number(profile?.year)));
}
export function weightedAd(campaigns,counts={},random=Math.random,previous) {
 const pool=campaigns.filter(c=>(counts[c._id]||0)<(c.frequencyCap||5));
 if(!pool.length)return null;
 const minimum=Math.min(...pool.map(c=>(counts[c._id]||0)/(c.weight||1)));
 let candidates=pool.filter(c=>(counts[c._id]||0)/(c.weight||1)===minimum);
 if(candidates.length>1)candidates=candidates.filter(c=>c._id!==previous);
 return candidates[Math.min(candidates.length-1,Math.floor(Math.max(0,random())*candidates.length))];
}
export const creativeSrc=(image,prefix='public')=>!image?'':image.kind==='url'?image.url:`/api/${prefix}/ad-media/${image.id}`;
