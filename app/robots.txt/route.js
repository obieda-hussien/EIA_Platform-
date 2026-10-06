import {siteOrigin} from '../../lib/seo.mjs';
import {isControlHost} from '../../lib/surface.mjs';
export function GET(req){const closed=isControlHost(req.headers.get('host'))||req.headers.get('host')!==new URL(siteOrigin()).host;return new Response(closed?'User-agent: *\nDisallow: /\n':`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /login\nDisallow: /?resource=\nSitemap: ${siteOrigin()}/sitemap.xml\n`,{headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'public, max-age=300'}});}
