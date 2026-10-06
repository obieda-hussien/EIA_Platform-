import Portal from "../components/Portal";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isControlHost } from "../lib/surface.mjs";
export default async function Page() {
  if (isControlHost((await headers()).get("host"))) redirect("/admin");
  return <Portal />;
}
