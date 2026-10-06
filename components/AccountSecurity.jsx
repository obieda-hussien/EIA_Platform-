"use client";
import { useEffect, useState } from "react";
import { api, Field, Notice } from "./shared";
export default function AccountSecurity({ onChanged }) {
  const [state, setState] = useState(null),
    [sessions, setSessions] = useState([]);
  const [currentPassword, setCurrentPassword] = useState(""),
    [newPassword, setNewPassword] = useState(""),
    [code, setCode] = useState("");
  const [enrollment, setEnrollment] = useState(null),
    [codes, setCodes] = useState([]);
  const [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function load() {
    const [security, devices] = await Promise.all([
      api("auth/security"),
      api("auth/sessions"),
    ]);
    setState(security);
    setSessions(devices.sessions);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function act(action) {
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(false);
    }
  }
  async function change(kind) {
    await act(async () => {
      const result = await api(`auth/${kind}`, {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          code: code.trim(),
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setCode("");
      if (kind === "mfa-enroll") {
        setEnrollment(result);
        setCodes([]);
        setMessage("أضف المفتاح لتطبيق المصادقة، ثم أدخل رمزه خلال ١٠ دقائق.");
      } else {
        setEnrollment(null);
        setCodes(result.recoveryCodes || []);
        await load();
        await onChanged();
        setMessage(
          kind === "mfa-confirm"
            ? "تم تفعيل التحقق بخطوتين. احتفظ بأكواد الاسترداد الآن."
            : "تم حفظ التغيير وإنهاء الجلسات الأخرى.",
        );
      }
    });
  }
  return (
    <section className="settings-layout">
      <Notice error>{error}</Notice>
      <Notice>{message}</Notice>
      <div className="panel">
        <h2>التحقق بخطوتين</h2>
        <p>
          يحمي حسابك حتى لو انكشفت كلمة المرور. استخدم تطبيق مصادقة يدعم رموز
          TOTP.
        </p>
        {state && (
          <p>
            {state.mfaEnabled
              ? `مفعّل · ${state.recoveryRemaining} أكواد استرداد متبقية`
              : "غير مفعّل — ننصح بتفعيله لكل أدمن"}
          </p>
        )}
        <Field label="كلمة المرور الحالية">
          <input
            type="password"
            autoComplete="current-password"
            maxLength={128}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        <Field label="رمز المصادقة أو كود الاسترداد">
          <input
            dir="ltr"
            autoComplete="one-time-code"
            maxLength={20}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        {enrollment && (
          <div className="upload-box">
            <p>
              في تطبيق المصادقة اختر إدخال مفتاح يدويًا: الحساب{" "}
              {enrollment.account}، النوع حسب الوقت، ٦ أرقام، كل ٣٠ ثانية.
            </p>
            <p>المفتاح خاص بحسابك. لا ترسله لأي شخص.</p>
            <code dir="ltr" className="mfa-secret">
              {enrollment.secret}
            </code>
            <button
              disabled={pending || !/^\d{6}$/.test(code)}
              onClick={() => change("mfa-confirm")}
            >
              تأكيد التفعيل
            </button>
          </div>
        )}
        {state &&
          !enrollment &&
          (state.mfaEnabled ? (
            <button
              className="secondary"
              disabled={pending || !currentPassword || !code}
              onClick={() => change("mfa-disable")}
            >
              إيقاف التحقق بخطوتين
            </button>
          ) : (
            <button
              disabled={pending || !currentPassword || !state.mfaAvailable}
              onClick={() => change("mfa-enroll")}
            >
              إعداد التحقق بخطوتين
            </button>
          ))}
        {codes.length > 0 && (
          <div className="upload-box">
            <h3>أكواد الاسترداد — تظهر مرة واحدة</h3>
            <p>
              احفظها في مكان آمن خارج جهازك. كل كود يُستخدم مرة واحدة بدل رمز
              التطبيق عند فقدانه.
            </p>
            <div dir="ltr" className="recovery-codes">
              {codes.map((value) => (
                <code key={value}>{value}</code>
              ))}
            </div>
            <button className="secondary" onClick={() => setCodes([])}>
              حفظتها في مكان آمن
            </button>
          </div>
        )}
      </div>
      <div className="panel">
        <h2>تغيير كلمة المرور</h2>
        <p>
          أدخل كلمة المرور الحالية أعلاه، ورمز المصادقة إذا كان التحقق بخطوتين
          مفعّلًا.
        </p>
        <Field label="كلمة المرور الجديدة — ١٢ حرفًا على الأقل">
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
        <button
          disabled={
            pending ||
            !currentPassword ||
            newPassword.length < 12 ||
            (state?.mfaEnabled && !code)
          }
          onClick={() => change("password")}
        >
          حفظ كلمة المرور
        </button>
      </div>
      <div className="panel">
        <h2>الجلسات النشطة</h2>
        <p>
          الجلسة تنتهي بعد ٣٠ دقيقة من عدم النشاط، وبحد أقصى ٨ ساعات. هذه
          القائمة لا تعرض أسرار الدخول.
        </p>
        <button
          className="secondary"
          disabled={pending}
          onClick={() =>
            act(async () => {
              await api("auth/sessions", { method: "DELETE" });
              await load();
              setMessage("تم إنهاء الجلسات الأخرى.");
            })
          }
        >
          إنهاء كل الجلسات الأخرى
        </button>
        {sessions.map((item) => (
          <div className="admin-row" key={item._id}>
            <div className="row-copy">
              <strong>{item.current ? "الجلسة الحالية" : "جلسة أخرى"}</strong>
              <span>
                آخر نشاط: {new Date(item.lastSeenAt).toLocaleString("ar-EG")}
              </span>
            </div>
            {!item.current && (
              <button
                className="secondary"
                disabled={pending}
                onClick={() =>
                  act(async () => {
                    await api(`auth/sessions/${item._id}`, {
                      method: "DELETE",
                    });
                    await load();
                  })
                }
              >
                إنهاء الجلسة
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
