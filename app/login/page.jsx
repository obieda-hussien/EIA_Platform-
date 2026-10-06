import { redirect } from "next/navigation";
import AdminLogin from "../../components/AdminLogin";
import { controlUser, publicSiteUrl } from "../../lib/control.mjs";
export const metadata = { title: "تسجيل الدخول | EIA Control", robots: { index: false, follow: false } };
export default async function LoginPage() {
  if (await controlUser(false)) redirect("/admin");
  return <AdminLogin publicUrl={publicSiteUrl()} />;
}
