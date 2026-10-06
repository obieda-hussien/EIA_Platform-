import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isControlHost } from "./surface.mjs";
import { session } from "./session.mjs";
export async function controlUser(required = true) {
  if (!isControlHost((await headers()).get("host"))) notFound();
  const user = await session(false);
  if (required && !user) redirect("/login");
  return user ? { ...user, _id: user._id.toString() } : null;
}
export function publicSiteUrl() {
  try {
    const url = new URL(process.env.PUBLIC_SITE_URL);
    if (url.protocol === "https:") return url.origin;
  } catch {}
  return "https://eia-platform-chi.vercel.app";
}
