'use client';
import {useEffect,useRef,useState} from 'react';
import {api,Icon,Notice} from './shared';
const keyBytes=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export default function PwaTools({compact=false}){
 const [install,setInstall]=useState(null),[standalone,setStandalone]=useState(false),[subscribed,setSubscribed]=useState(false),[supported,setSupported]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');const registration=useRef(null);
 useEffect(()=>{
  setStandalone(window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true);
  const prompt=e=>{e.preventDefault();setInstall(e);},installed=()=>{setStandalone(true);setInstall(null);};window.addEventListener('beforeinstallprompt',prompt);window.addEventListener('appinstalled',installed);
  let alive=true;const register=()=>{if(typeof navigator==='undefined'||!('serviceWorker' in navigator))return;void navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'}).then(async reg=>{registration.current=reg;if(alive){setSupported('PushManager' in window&&'Notification' in window);setSubscribed(Boolean(await reg.pushManager?.getSubscription()));}}).catch(()=>{});};
  if(document.readyState==='complete')register();else window.addEventListener('load',register,{once:true});
  const sync=()=>{void registration.current?.pushManager?.getSubscription().then(sub=>{if(alive)setSubscribed(Boolean(sub));});};window.addEventListener('eia-push-changed',sync);
  return()=>{alive=false;window.removeEventListener('eia-push-changed',sync);window.removeEventListener('load',register);window.removeEventListener('beforeinstallprompt',prompt);window.removeEventListener('appinstalled',installed);};
 },[]);
 async function act(action){setBusy(true);setError('');setMessage('');try{await action();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="pwa-tools"><div><span className="privacy-icon"><Icon name="phone"/></span><div><h3>{compact?'إشعارات هذا الجهاز':'منصتك على جهازك'}</h3><p>ثبّت المنصة، واختر تلقي تنبيهات الإعلانات العامة. التثبيت والإشعارات اختياريان.</p></div></div><div className="pwa-actions">{!compact&&!standalone&&<button className="secondary small" disabled={busy} onClick={()=>act(async()=>{if(install){await install.prompt();await install.userChoice;setInstall(null);}else setMessage('من قائمة المتصفح اختار «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية». على iPhone استخدم زر المشاركة في Safari.');})}><Icon name="phone" size={17}/>تثبيت المنصة</button>}<button className="secondary small" disabled={busy||!supported} onClick={()=>act(async()=>{
 const reg=registration.current;if(!reg)throw new Error('أعد تحميل الصفحة لتجهيز التطبيق.');
 const permissionRequest=subscribed?null:Notification.requestPermission();
 await navigator.serviceWorker.ready;
 if(subscribed){await api('push/unsubscribe',{method:'POST',body:'{}'});await (await reg.pushManager.getSubscription())?.unsubscribe();setSubscribed(false);window.dispatchEvent(new Event('eia-push-changed'));setMessage('تم إيقاف الإشعارات لهذا المتصفح.');return;}
 const config=await api('push/config');if(!config.available)throw new Error('الإشعارات غير متاحة حاليًا.');
 const permission=await permissionRequest;if(permission!=='granted')throw new Error('لم يتم منح إذن الإشعارات. يمكنك تغييره من إعدادات المتصفح.');
 const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.publicKey)});
 try{await api('push/subscribe',{method:'POST',body:JSON.stringify({subscription:sub.toJSON()})});}catch(e){await sub.unsubscribe();throw e;}setSubscribed(true);window.dispatchEvent(new Event('eia-push-changed'));setMessage('تم تفعيل تنبيهات الإعلانات العامة.');
 })}><Icon name="bell" size={17}/>{subscribed?'إيقاف الإشعارات':'تفعيل الإشعارات'}</button><a href="/about">عن المنصة</a><a href="/library">دليل المحتوى</a></div>{!supported&&<p className="account-note">تفعيل الإشعارات يحتاج متصفحًا يدعم Web Push، وقد يتطلب التثبيت أولًا على iPhone.</p>}<Notice>{message}</Notice><Notice error>{error}</Notice></section>;
}
