'use strict';
const CACHE='eia-offline-v1';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['/offline.html','/icons/icon-192.png']))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('eia-offline-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
// Never cache HTML, API responses, account data or PDFs. Offline is a neutral fallback.
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.mode==='navigate'&&u.origin===self.location.origin&&(/^\/(?:library|about|resources|subjects|news)(?:\/|$)/.test(u.pathname)||u.pathname==='/'))event.respondWith(fetch(event.request).catch(()=>caches.match('/offline.html')));});
self.addEventListener('push',event=>{let data={};try{data=event.data?.json()||{};}catch{}const path=/^\/news\/[a-f0-9]{24}$/.test(data.path||'')?data.path:'/';event.waitUntil(self.registration.showNotification(String(data.title||'EIA Platform').slice(0,200),{body:String(data.body||'إعلان جديد على المنصة').slice(0,250),icon:'/icons/icon-192.png',badge:'/icons/badge.png',tag:String(data.tag||'eia-news').slice(0,80),data:{path}}));});
self.addEventListener('notificationclick',event=>{event.notification.close();const path=/^\/news\/[a-f0-9]{24}$/.test(event.notification.data?.path||'')?event.notification.data.path:'/';event.waitUntil(self.clients.openWindow(new URL(path,self.location.origin).href));});
