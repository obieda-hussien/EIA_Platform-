import { NextResponse } from "next/server";
import { pageCsp } from "./lib/csp.mjs";
export function proxy(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = pageCsp(nonce, process.env.NODE_ENV === "production");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: ["/((?!api(?:/|$)|_next/static|_next/image|favicon.ico).*)"],
};
