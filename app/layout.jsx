import "./globals.css";
import {headers} from 'next/headers';
import {isControlHost} from '../lib/surface.mjs';
import {pageMetadata,siteDescription,siteOrigin} from '../lib/seo.mjs';
export const dynamic='force-dynamic';
export const viewport={width:'device-width',initialScale:1,themeColor:'#242530'};
export async function generateMetadata(){const control=isControlHost((await headers()).get('host'));return {metadataBase:new URL(siteOrigin()),...pageMetadata('EIA Platform | مكتبتك الدراسية',siteDescription,'/'),...(control?{robots:{index:false,follow:false}}:{manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'EIA',statusBarStyle:'default'},robots:{index:true,follow:true,'max-image-preview':'large'}}),icons:{icon:[{url:'/icons/app.svg',type:'image/svg+xml'},{url:'/icons/icon-192.png',sizes:'192x192',type:'image/png'}],apple:[{url:'/icons/apple-touch-icon.png',sizes:'180x180'}]}};}
export default function Layout({children}){return <html lang="ar" dir="rtl"><body>{children}</body></html>;}
