import {StructuredData} from "../components/Discovery";
import {siteOrigin,siteDescription} from "../lib/seo.mjs";
import Portal from "../components/Portal";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isControlHost } from "../lib/surface.mjs";
export default async function Page() {
  if (isControlHost((await headers()).get("host"))) redirect("/admin");
  return <><StructuredData value={{"@context":"https://schema.org","@type":"WebSite",name:"EIA Platform",url:siteOrigin()+"/",description:siteDescription,inLanguage:"ar"}}/><Portal /></>;
}
