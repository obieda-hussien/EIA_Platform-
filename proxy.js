import { NextResponse } from "next/server";
import { pageCsp } from "./lib/csp.mjs";
import {siteOrigin} from "./lib/seo.mjs";
import { surfaceAllows } from "./lib/surface.mjs";
export function proxy(request) {
  if (!surfaceAllows(request.headers.get("host"), request.nextUrl.pathname)) {
    return request.nextUrl.pathname.startsWith("/api/")
      ? NextResponse.json({ error: "الصفحة غير موجودة." }, { status: 404, headers: { "Cache-Control": "private, no-store" } })
      : new NextResponse("الصفحة غير موجودة.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
  }
  if (/^\/(?:icons\/|sw\.js$|offline\.html$)/.test(request.nextUrl.pathname)) return NextResponse.next();
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = pageCsp(nonce, process.env.NODE_ENV === "production");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  if(request.headers.get("host")!==new URL(siteOrigin()).host)response.headers.set("X-Robots-Tag","noindex, nofollow");
  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
