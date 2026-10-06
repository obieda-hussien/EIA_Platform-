"use client";
export default function ErrorPage({ reset }) {
  return (
    <main className="container empty">
      <h1>تعذر تحميل الصفحة</h1>
      <p>حاول مرة أخرى.</p>
      <button onClick={reset}>إعادة المحاولة</button>
      <a href="/">الرئيسية</a>
    </main>
  );
}
