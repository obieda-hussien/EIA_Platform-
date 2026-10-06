import test from 'node:test';import assert from 'node:assert/strict';
import {weightedAd,eligibleAds} from '../lib/ad-selection.mjs';
import {creative,campaignInput} from '../lib/campaigns.mjs';
import {publicDocument} from '../lib/public-data.mjs';
test('Weighted pacing balances eligible impressions at 3:1 and honors session caps',()=>{
 const ads=[{_id:'a',weight:3,frequencyCap:30},{_id:'b',weight:1,frequencyCap:30}],counts={};let prior;
 for(let n=0;n<40;n++){const ad=weightedAd(ads,counts,()=>.5,prior);assert.ok(ad);counts[ad._id]=(counts[ad._id]||0)+1;prior=ad._id;}
 assert.deepEqual(counts,{b:10,a:30});assert.equal(weightedAd([{_id:'a',frequencyCap:1}],{a:1}),null);
});
test('Expired, wrong slot and wrong academic target cannot enter rotation',()=>{
 const now=Date.now(),base={_id:'a',slot:'home',startsAt:new Date(now-1000),endsAt:new Date(now+1000)};
 assert.equal(eligibleAds([base,{...base,slot:'footer'},{...base,endsAt:new Date(now-1)},{...base,department:'other'},{...base,year:4}], 'home',{department:'bis',year:3},now).length,1);
});
test('Creative schema blocks scripts, private addresses and invalid asset IDs, and projection is positive',()=>{
 for(const url of ['javascript:alert(1)','https://127.0.0.1/banner.png','https://[::1]/icon.png','https://app.local/banner.png','https://user:pass@example.test/banner.png','https://example.test/script.svg'])assert.throws(()=>creative({kind:'url',url}));
 assert.throws(()=>creative({kind:'upload',id:'$where'}));
 assert.deepEqual(publicDocument('campaigns',{icon:{kind:'upload',id:'a'.repeat(24),ownerEmail:'secret',data:'bytes'},contact:'private'}),{icon:{kind:'upload',id:'a'.repeat(24)}});
 const base={title:'x',url:'https://eia.edu.eg/',slot:'home',status:'draft'};assert.throws(()=>campaignInput({...base,weight:11}));assert.throws(()=>campaignInput({...base,frequencyCap:0}));
});
