"use client";
import { useEffect, useState } from "react";
import { api, Brand, Icon, Notice, Field } from "./shared";
export default function AdminLogin({ publicUrl }) {
  const [setup, setSetup] = useState(false), [setupEnabled, setSetupEnabled] = useState(false),
    [loading, setLoading] = useState(true), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [credentials, setCredentials] = useState({ email: "", password: "", name: "", setupToken: "", code: "" });
  async function boot() {
    setLoading(true); setError("");
    try { const state = await api("auth/status"); setSetup(state.setupRequired); setSetupEnabled(state.setupEnabled); }
    catch(e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { boot(); }, []);
  async function login(event) {
    event.preventDefault(); if (pending) return;
    setPending(true); setError("");
    try { await api(`auth/${setup ? "setup" : "login"}`, { method: "POST", body: JSON.stringify(credentials) }); window.location.replace("/admin"); }
    catch(e) { setError(e.message); } finally { setPending(false); }
  }
  return (
      <div className="control-login">
        <header className="site-header">
          <div className="header-inner">
            <Brand href="/login" subtitle="CONTROL" />
            <a className="text-button" href={publicUrl}>
              عرض الموقع ←
            </a>
          </div>
        </header>
        <main className="login-layout container">
          <div className="login-copy">
            <p className="eyebrow">EIA CONTROL / مساحة الإدارة</p>
            <h1>
              إدارة أهدى.
              <br />
              <span>تأثير أكبر.</span>
            </h1>
            <p>مساحة خاصة لفريق المنصة. كل أدوات النشر والتنظيم، في مكان واضح وبسيط.</p>
            <div className="login-features">
              <span>
                <Icon name="link" /> روابط Drive وتيليجرام
              </span>
              <span>
                <Icon name="file" /> ملفات PDF خفيفة
              </span>
              <span>
                <Icon name="user" /> صلاحيات للأدمنز والمحررين
              </span>
            </div>
          </div>
          <section className="login-card">
            <span className="small-label">لوحة الإدارة</span>
            <h2>{setup ? "تأسيس حساب المالك" : "أهلًا بعودتك"}</h2>
            <p className="muted">
              {setup
                ? "استخدم رمز التأسيس من إعدادات Vercel، ثم اختار بيانات حسابك."
                : "سجّل دخولك لإدارة محتوى المنصة."}
            </p>
            <Notice error>{error}</Notice>
            {loading ? (
              <p role="status">جاري التحقق من إعدادات المنصة…</p>
            ) : (
              <form onSubmit={login}>
                {setup && (
                  <>
                    <Field label="اسمك">
                      <input
                        required
                        value={credentials.name}
                        onChange={(e) =>
                          setCredentials({
                            ...credentials,
                            name: e.target.value,
                          })
                        }
                        autoComplete="name"
                      />
                    </Field>
                    <Field label="رمز التأسيس">
                      <input
                        required
                        type="password"
                        value={credentials.setupToken}
                        onChange={(e) =>
                          setCredentials({
                            ...credentials,
                            setupToken: e.target.value,
                          })
                        }
                        autoComplete="off"
                      />
                    </Field>
                    {!setupEnabled && (
                      <Notice error>
                        أضف ADMIN_SETUP_TOKEN إلى إعدادات Vercel لتأسيس الحساب.
                      </Notice>
                    )}
                  </>
                )}
                <Field label="البريد الإلكتروني">
                  <input
                    required
                    type="email"
                    dir="ltr"
                    value={credentials.email}
                    onChange={(e) =>
                      setCredentials({ ...credentials, email: e.target.value })
                    }
                    autoComplete="username"
                  />
                </Field>
                <Field label="كلمة المرور">
                  <input
                    required
                    type="password"
                    minLength={setup ? 12 : 1}
                    maxLength={128}
                    value={credentials.password}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        password: e.target.value,
                      })
                    }
                    autoComplete={setup ? "new-password" : "current-password"}
                  />
                </Field>
                {!setup && (
                  <Field label="رمز المصادقة أو الاسترداد — إذا فعّلت التحقق بخطوتين">
                    <input
                      dir="ltr"
                      autoComplete="one-time-code"
                      maxLength={20}
                      value={credentials.code || ""}
                      onChange={(e) =>
                        setCredentials({
                          ...credentials,
                          code: e.target.value.trim(),
                        })
                      }
                    />
                  </Field>
                )}
                <button
                  className="full"
                  disabled={pending || (setup && !setupEnabled)}
                >
                  {pending
                    ? "جاري التنفيذ…"
                    : setup
                      ? "إنشاء حساب المالك"
                      : "تسجيل الدخول"}{" "}
                  <Icon name="arrow" size={18} />
                </button>
              </form>
            )}
            <button className="text-button" onClick={boot}>
              إعادة التحقق من الاتصال
            </button>
          </section>
        </main>
      </div>
    );
}
