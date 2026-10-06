import "./globals.css";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "EIA Platform | مكتبتك الدراسية",
  description:
    "منصة طلابية مستقلة لتنظيم مواد ومحاضرات المعهد المصري لأكاديمية الإسكندرية.",
};
export default function Layout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
