'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { api, Icon, Notice } from './shared';
export function useTelemetry(view) {
  const [choice,setChoice]=useState(null),[enabled,setEnabled]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const tab=useRef(null), interaction=useRef(0), tracking=useRef(false), lastView=useRef(view);
  lastView.current=view; tracking.current=enabled;
  useEffect(()=>{
    try { const preference=localStorage.getItem('eia_metrics_choice'); if(preference==='yes'||preference==='no') { setChoice(preference); api('telemetry/consent',{method:'POST',body:JSON.stringify({enabled:preference==='yes'})}).then(r=>setEnabled(r.enabled)).catch(()=>setEnabled(false)); } }catch{}
  },[]);
  const setConsent=useCallback(async(value)=>{
    setBusy(true);setError('');
    try { const r=await api('telemetry/consent',{method:'POST',body:JSON.stringify({enabled:value})}); setChoice(value?'yes':'no');setEnabled(r.enabled);try{localStorage.setItem('eia_metrics_choice',value?'yes':'no');}catch{} }
    catch(e){setError(e.message);}finally{setBusy(false);}
  },[]);
  const track=useCallback((type,target)=>{
    if(!tracking.current)return;
    void api('telemetry/event',{method:'POST',body:JSON.stringify({type,target})}).catch(()=>{});
  },[]);
  useEffect(()=>{
    if(!enabled)return;
    tab.current ||= crypto.randomUUID(); interaction.current=performance.now();
    const leaseKey='eia_metrics_leader'; let alive=true, previousVisible=false;
    const claim=()=>{
      try { const current=JSON.parse(localStorage.getItem(leaseKey)||'null'); if(current&&current.id!==tab.current&&current.until>Date.now())return false; localStorage.setItem(leaseKey,JSON.stringify({id:tab.current,until:Date.now()+22000})); return true; }catch{return false;}
    };
    const owns=()=>{try{return JSON.parse(localStorage.getItem(leaseKey)||'null')?.id===tab.current;}catch{return false;}};
    const release=()=>{try{if(owns())localStorage.removeItem(leaseKey);}catch{}};
    const pulse=()=>{
      const visible=document.visibilityState==='visible';
      if(visible&&!claim())return;
      if(!visible&&!owns())return;
      previousVisible=visible;
      void api('telemetry/pulse',{method:'POST',body:JSON.stringify({visible,active:visible&&performance.now()-interaction.current<60000}),keepalive:true}).then(r=>{if(alive&&!r.enabled)setEnabled(false);}).catch(()=>{});
      if(visible)track('view',lastView.current);else release();
    };
    const interacted=()=>{interaction.current=performance.now();};
    const pageHide=()=>{if(owns()&&previousVisible){void api('telemetry/pulse',{method:'POST',body:JSON.stringify({visible:false,active:false}),keepalive:true}).catch(()=>{});release();}};
    for(const event of ['pointerdown','keydown','scroll']) window.addEventListener(event,interacted,{passive:true});
    document.addEventListener('visibilitychange',pulse);window.addEventListener('pagehide',pageHide);
    pulse();const timer=setInterval(pulse,15000);
    return()=>{alive=false;clearInterval(timer);pageHide();for(const event of ['pointerdown','keydown','scroll'])window.removeEventListener(event,interacted);document.removeEventListener('visibilitychange',pulse);window.removeEventListener('pagehide',pageHide);release();};
  },[enabled,track]);
  useEffect(()=>{if(enabled&&document.visibilityState==='visible')track('view',view);},[view,enabled,track]);
  return {choice,enabled,busy,error,setConsent,track};
}
export function PrivacyPanel({metrics}) {
  return <section className="privacy-panel"><div><span className="privacy-icon"><Icon name="shield" /></span><div><h3>خصوصيتك، باختيارك</h3><p>نقيس وقت التصفح والنشاط وإعلانات المنصة عند موافقتك. نستخدم معرّف متصفح عشوائي، ونربط حسابات ظهرت على نفس المتصفح لأمان الحساب. بدون بصمة Canvas أو تعقّب خارج المنصة. يمكنك إيقاف القياس في أي وقت.</p></div></div><div className="privacy-actions">{metrics.choice===null?<><button className="secondary small" disabled={metrics.busy} onClick={()=>metrics.setConsent(false)}>بدون قياس</button><button className="small" disabled={metrics.busy} onClick={()=>metrics.setConsent(true)}>السماح بالقياس</button></>:<button className="secondary small" disabled={metrics.busy} onClick={()=>metrics.setConsent(!metrics.enabled)}>{metrics.enabled?'إيقاف قياس النشاط':'تشغيل قياس النشاط'}</button>}<span className="muted">{metrics.enabled?'القياس مفعّل':'القياس متوقف'}</span></div><Notice error>{metrics.error}</Notice></section>;
}
export function AdSlot({campaigns=[],slot,track,enabled}) {
  const ad=campaigns.find(c=>c.slot===slot),ref=useRef(null);
  useEffect(()=>{
    if(!ad||!enabled||typeof IntersectionObserver==='undefined')return;
    let timer, inView=false, measured=false;
    const schedule=()=>{clearTimeout(timer);if(!measured&&inView&&document.visibilityState==='visible')timer=setTimeout(()=>{if(inView&&document.visibilityState==='visible'){measured=true;track('ad_impression',ad._id);observer.disconnect();}},1000);};
    const observer=new IntersectionObserver(entries=>{inView=entries[0]?.intersectionRatio>=.5;schedule();},{threshold:.5});
    document.addEventListener('visibilitychange',schedule);
    observer.observe(ref.current);return()=>{clearTimeout(timer);observer.disconnect();document.removeEventListener('visibilitychange',schedule);};
  },[ad?._id,enabled,track]);
  if(!ad)return null;
  return <aside className="sponsored-card" ref={ref}><span className="sponsored-icon"><Icon name="megaphone" size={24}/></span><div><span className="sponsored-label">إعلان ممول · {new URL(ad.url).hostname}</span><h3>{ad.title}</h3><p>{ad.description}</p></div><a className="button secondary" href={ad.url} target="_blank" rel="noopener noreferrer sponsored" onClick={()=>track('ad_click',ad._id)}>{ad.label}<Icon name="external" size={16}/></a></aside>;
}
