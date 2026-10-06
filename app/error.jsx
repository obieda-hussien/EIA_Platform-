"use client";
export default function ErrorPage({ reset }) {
  return (
    <main className="container empty">
      <h1 className="error-title">تعذر تحميل الصفحة</h1>
      <p>حاول مرة أخرى، أو ارجع للصفحة الرئيسية.</p>
      <div className="error-actions">
        <button onClick={reset}>إعادة المحاولة</button>
        <a className="button secondary" href="/">
          الرئيسية
        </a>

      </div>
    </main>
  );
}
