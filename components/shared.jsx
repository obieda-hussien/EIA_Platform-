"use client";
import { useEffect, useRef, useState } from "react";
export const KINDS = {
  summary: "ملخص",
  lecture: "محاضرة",
  section: "سكشن",
  exam: "امتحان سابق",
  answers: "إجابات",
};
export const STATUSES = {
  draft: "مسودة",
  published: "منشور",
  archived: "مؤرشف",
};
export const ROLES = {
  owner: "مالك المنصة",
  admin: "أدمن",
  editor: "محرر محتوى",
};
export const bytes = (n) =>
  !n
    ? "—"
    : n >= 1048576
      ? `${(n / 1048576).toFixed(1)} MB`
      : `${Math.ceil(n / 1024)} KB`;
export async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, {
    ...options,
    headers:
      options.body instanceof FormData
        ? options.headers
        : { "Content-Type": "application/json", ...options.headers },
    cache: "no-store",
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("تعذر قراءة استجابة الخادم.");
  }
  if (!response.ok) {
    const error = new Error(data.error || "تعذر إتمام العملية.");
    error.status = response.status;
    throw error;
  }
  return data;
}
const ICON_PATHS = {
  send:"m3 3 18 9-18 9 4-9-4-9Zm4 9h14",
  upload:"M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4",
  bell:"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12a2 2 0 0 0 4 0",
  phone:"M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm3 3h4m-3 14h2",
  book: "M12 6.5c-2.5-2-5.5-2-8-1v14c2.5-1 5.5-1 8 1 2.5-2 5.5-2 8-1v-14c-2.5-1-5.5-1-8 1Zm0 0v14M7 9h2M15 9h2",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 12h6M9 16h4",
  folder: "M3 7V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z",
  search: "M16.5 16.5 21 21M18 10.5a7.5 7.5 0 1 1-15 0 7.5 7.5 0 0 1 15 0Z",
  arrow: "M19 12H5m6-6-6 6 6 6",
  chevron: "m9 5 7 7-7 7",
  external: "M14 3h7v7m0-7-10 10M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5",
  grid: "M5 3h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm11 0h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM5 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Zm11 0h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Z",
  news: "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 5h4v4H7V8Zm8 0h2m-2 4h2M7 16h10",
  save: "M7 3h10a1 1 0 0 1 1 1v17l-6-4-6 4V4a1 1 0 0 1 1-1Z",
  link: "m10 13 4-2M8 16H7a4 4 0 0 1 0-8h3m4 0h3a4 4 0 0 1 0 8h-3",
  plus: "M12 5v14M5 12h14",
  check: "m5 12 4 4L19 6",
  user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2",
  share: "M20 5a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm-12 7a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm12 7a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM8 10.8l7-4.5M8 13.2l7 4.5",
  refresh: "M20 10a8 8 0 0 0-14-5L3 8m0-5v5h5M4 14a8 8 0 0 0 14 5l3-3m-5 0h5v5",
  menu: "M4 6h16M4 12h11M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
  shield: "m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6",
  calendar: "M7 2v4m10-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 10h1m6 0h1m-8 4h1",
  clock: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-5v5l3 2",
  cloud: "M7 18a5 5 0 1 1 .6-10 6 6 0 0 1 11.3 2A4 4 0 0 1 18 18M12 21V11m-3 3 3-3 3 3",
  graduate: "m2 8 10-5 10 5-10 5-10-5Zm4 2v7c4 3 8 3 12 0v-7M22 8v9",
  megaphone: "M4 8h5l11-5v18L9 16H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Zm5 0v8m-4 0 2 5h4l-2-5",
  chart: "M4 3v17a1 1 0 0 0 1 1h16M8 16v-4m5 4V7m5 9v-7",
  eye: "M2 12c5-9 15-9 20 0-5 9-15 9-20 0Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  mail: "M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm-2 2 9 6 9-6",
  logout: "M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4m6-14 5 5-5 5M9 12h11",
  download: "M12 3v12m-4-4 4 4 4-4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  heart: "M20 4a5 5 0 0 0-8 2 5 5 0 0 0-8-2c-5 5 1 11 8 17 7-6 13-12 8-17Z",
  pin: "m8 3 8 0-1 7 4 4H5l4-4-1-7Zm4 11v8",
  settings: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm-2-5h4l.7 2.4 2 .9 2.3-.6 2 3.5-1.6 1.8v2l1.6 1.8-2 3.5-2.3-.6-2 .9L14 21h-4l-.7-2.4-2-.9-2.3.6-2-3.5L4.6 13v-2L3 9.2l2-3.5 2.3.6 2-.9L10 3Z",
  trash: "M3 6h18M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5 6l1 14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1l1-14M10 10v7m4-7v7",
};
export function Icon({ name = "book", size = 22 }) {
  return <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={ICON_PATHS[name] || ICON_PATHS.book}/></svg>;
}
export function Brand({ title = "EIA", href = "/", subtitle = "PLATFORM" }) {
  return (
    <a className="brand" href={href}>
      <span className="logo">
        <Icon />
      </span>
      <span>
        {title === "EIA Platform" ? "EIA" : title}
        <span className="brand-small">{subtitle}</span>
      </span>
    </a>
  );
}
export function Notice({ children, error = false }) {
  return children ? (
    <div
      role={error ? "alert" : "status"}
      className={`notice ${error ? "error" : ""}`}
    >
      {children}
    </div>
  ) : null;
}
export function Empty({ title = "لسه مفيش محتوى", children }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon name="book" size={34} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Modal({ title, onClose, children }) {
  const ref = useRef(null), closeTimer = useRef(null), [closing, setClosing] = useState(false);
  function requestClose() {
    if (closing) return;
    setClosing(true);
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    closeTimer.current = setTimeout(onClose, reduced ? 0 : 160);
  }
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector("button")?.focus();
    return () => {
      clearTimeout(closeTimer.current);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);
  function keyboard(e) {
    if (e.key === "Escape") requestClose();
    if (e.key === "Tab") {
      const all = [
        ...ref.current.querySelectorAll(
          "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
        ),
      ];
      const first = all[0],
        last = all.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  }
  return (
    <div className={`modal-backdrop ${closing ? "is-closing" : ""}`} onClick={requestClose}>
      <section
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={keyboard}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={requestClose} aria-label="إغلاق">
            <Icon name="close" size={20}/>
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
