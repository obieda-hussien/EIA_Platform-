"use client";
import { useState } from "react";
import { Brand, Field, Icon, Notice } from "./shared";
import { SITE_DEFAULTS } from "../lib/validation.mjs";

export default function Settings({ settings, onSave }) {
  const initial = Object.fromEntries(
    Object.keys(SITE_DEFAULTS).map((key) => [
      key,
      settings[key] ?? SITE_DEFAULTS[key],
    ]),
  );
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const dirty = Object.keys(initial).some((key) => draft[key] !== initial[key]);
  function change(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  }
  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const saved = await onSave(draft);
      setDraft(
        Object.fromEntries(
          Object.keys(SITE_DEFAULTS).map((key) => [
            key,
            saved[key] ?? SITE_DEFAULTS[key],
          ]),
        ),
      );
      setMessage("تم حفظ الإعدادات. هتظهر للطلبة عند فتح المنصة أو تحديثها.");
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="settings-layout">
      <section className="panel">
        <p className="eyebrow">شكل المنصة ومعلوماتها</p>
        <h2>هوية المنصة</h2>
        <Notice error>{error}</Notice>
        <Notice>{message}</Notice>
        <form onSubmit={submit}>
          <fieldset className="settings-fields" disabled={pending}>
            <Field label="اسم المنصة">
              <input
                required
                maxLength={100}
                value={draft.title}
                onChange={(e) => change("title", e.target.value)}
              />
            </Field>
            <Field label="وصف المنصة">
              <textarea
                required
                maxLength={400}
                value={draft.description}
                onChange={(e) => change("description", e.target.value)}
              />
            </Field>
            <Field label="لون المنصة">
              <select
                value={draft.accent}
                onChange={(e) => change("accent", e.target.value)}
              >
                <option value="emerald">أخضر</option>
                <option value="violet">بنفسجي</option>
                <option value="blue">أزرق</option>
              </select>
            </Field>
            <Field label="تنويه أعلى المنصة (اختياري)">
              <textarea
                maxLength={240}
                value={draft.bannerText}
                onChange={(e) => change("bannerText", e.target.value)}
                placeholder="تنويه قصير لكل الطلبة، اتركه فارغًا لإخفائه."
              />
            </Field>
            <Field label="رابط قناة أو مجموعة الطلبة (اختياري)">
              <input
                type="url"
                dir="ltr"
                maxLength={600}
                value={draft.communityUrl}
                onChange={(e) => change("communityUrl", e.target.value)}
                placeholder="https://t.me/eia_students"
              />
            </Field>
            <div className="form-actions">
              <button disabled={pending || !dirty}>
                {pending ? "جاري الحفظ…" : "حفظ الإعدادات"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={pending || !dirty}
                onClick={() => {
                  setDraft(initial);
                  setError("");
                  setMessage("");
                }}
              >
                تراجع عن التغييرات
              </button>
            </div>
            <p className="muted settings-hint">
              {dirty
                ? "عندك تغييرات لم تُحفظ بعد."
                : "الإعدادات الحالية محفوظة."}
            </p>
          </fieldset>
        </form>
      </section>
      <aside className="settings-preview" data-accent={draft.accent}>
        <section className="panel">
          <p className="eyebrow">معاينة مباشرة</p>
          <Brand title={draft.title || "EIA Platform"} />
          {draft.bannerText && (
            <p className="platform-banner">
              <Icon name="news" size={18} />
              {draft.bannerText}
            </p>
          )}
          <h2>
            كل محاضرة. <span className="accent-text">في مكانها.</span>
          </h2>
          <p className="muted">{draft.description}</p>
          <span className="tag mint">مكتبتك الدراسية</span>
          {draft.communityUrl && <p className="accent-text">قناة الطلبة ↗</p>}
        </section>
        <section className="panel storage-guide">
          <h2>طريقة نشر الملفات</h2>
          <p>
            <Icon name="file" size={18} /> PDF حتى ٢ ميجابايت للرفع المباشر.
          </p>
          <p>
            <Icon name="link" size={18} /> الملفات الأكبر بروابط Drive أو
            تيليجرام.
          </p>
          <p className="muted">
            راجع صلاحيات مشاركة الروابط قبل النشر. المسودات والمحتوى المؤرشف
            بيظهروا للإدارة فقط.
          </p>
        </section>
      </aside>
    </div>
  );
}
