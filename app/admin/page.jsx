import Admin from "../../components/Admin";
import { controlUser, publicSiteUrl } from "../../lib/control.mjs";
export const metadata = { title: "الإدارة | EIA Control", robots: { index: false, follow: false } };
export default async function Page() {
  const user = await controlUser();
  return <Admin initialUser={user} publicUrl={publicSiteUrl()} />;
}
