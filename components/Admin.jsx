"use client";
import { useEffect, useRef, useState } from "react";
import {
  api,
  Brand,
  Icon,
  Notice,
  Empty,
  Field,
  Modal,
  KINDS,
  STATUSES,
  ROLES,
  bytes,
} from "./shared";
import { DEPARTMENTS, UPLOAD_LIMIT } from "../lib/validation.mjs";
import { adminRecords } from "../lib/catalog.mjs";
import Settings from "./Settings";
import AccountSecurity from "./AccountSecurity";
const TABS = [
  ["overview", "نظرة عامة", "grid"],
  ["resources", "المحتوى والملفات", "file"],
  ["subjects", "المواد الدراسية", "book"],
  ["news", "الإعلانات", "news"],
  ["admins", "حسابات الأدمنز", "user"],
  ["audit", "سجل النشاط", "check"],
  ["settings", "إعدادات المنصة", "grid"],
  ["security", "أمان الحساب", "check"],
];
const DEFAULTS = {
  subjects: {
    name: "",
    code: "",
    department: "bis",
    year: 3,
    term: 1,
    academicYear: "2026/2027",
    lecturer: "",
    group: "",
    active: true,
  },
  resources: {
    title: "",
    description: "",
    subjectId: "",
    lecture: 1,
    kind: "summary",
    status: "draft",
    source: "",
    links: [],
  },
  news: {
    title: "",
    body: "",
    department: "",
    year: 0,
    pinned: false,
    status: "draft",
    sourceUrl: "",
    expiresAt: "",
  },
  admins: { name: "", email: "", password: "", role: "editor", active: true },
};
export default function Admin({ initialUser = null, publicUrl = "https://eia-platform-chi.vercel.app" }) {
  const [user, setUser] = useState(initialUser),
    [data, setData] = useState(null),
    [tab, setTab] = useState("overview"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [menuOpen, setMenuOpen] = useState(false);
  const [pending, setPending] = useState(false),
    [editing, setEditing] = useState(null),
    [form, setForm] = useState({}),
    [file, setFile] = useState(null),
    [linkText, setLinkText] = useState(""),
    [filter, setFilter] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [subjectFilter, setSubjectFilter] = useState(""),
    [page, setPage] = useState(1),
    [confirmation, setConfirmation] = useState(null);
  const menuButton = useRef(null);
  useEffect(() => {
    if (!menuOpen) return;
    const sidebar = document.getElementById("control-navigation");
    const mobile = window.matchMedia?.("(max-width: 760px)").matches;
    if (mobile) sidebar?.querySelector("nav button")?.focus();
    const close = (event) => {
      if (event.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); }
      if (mobile && event.key === "Tab") {
        const stops = [menuButton.current, ...sidebar.querySelectorAll("a[href], button:not(:disabled)")].filter(Boolean);
        const first = stops[0], last = stops.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [menuOpen]);
  useEffect(() => {
    setPage(1);
  }, [tab, filter, statusFilter, subjectFilter]);
  async function boot() {
    setLoading(true);
    setError("");
    try {
      const result = await api("auth/session");
      if (result.user) {
        setUser(result.user);
        setData(await api("admin/overview"));
      } else {
        setUser(null);
        setData(null);
        window.location.replace("/login");
      }
    } catch (e) {
      if (e.status === 401) {
        setUser(null);
        setData(null);
      }
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    boot();
  }, []);
  async function act(fn) {
    if (pending) return;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      if (e.status === 401) {
        setUser(null);
        setData(null);
        setEditing(null);
        setConfirmation(null);
        window.location.replace("/login");
      }
      setError(e.message);
    } finally {
      setPending(false);
    }
  }
  function edit(entity, item = null) {
    setError("");
    setMessage("");
    setEditing({ entity, id: item?._id });
    setForm({
      ...DEFAULTS[entity],
      ...item,
      expiresAt: item?.expiresAt
        ? new Date(item.expiresAt).toISOString().slice(0, 10)
        : "",
    });
    setLinkText(item?.links?.map((l) => l.url).join("\n") || "");
    setFile(null);
  }
  function change(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  async function save(e) {
    e.preventDefault();
    await act(async () => {
      const { entity, id } = editing;
      const payload = { ...form };
      delete payload._id;
      delete payload.upload;
      delete payload.createdAt;
      delete payload.updatedAt;
      delete payload.updatedBy;
      let body;
      if (entity === "resources") {
        payload.links = linkText
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        body = new FormData();
        body.set("metadata", JSON.stringify(payload));
        if (file) body.set("file", file);
      } else body = JSON.stringify(payload);
      await api(`admin/${entity}${id ? `/${id}` : ""}`, {
        method: id ? "PUT" : "POST",
        body,
      });
      setEditing(null);
      setData(await api("admin/overview"));
      setMessage("تم حفظ التغييرات.");
    });
  }
  async function archive() {
    await act(async () => {
      await api(`admin/${confirmation.entity}/${confirmation.id}`, {
        method: "DELETE",
      });
      setConfirmation(null);
      setData(await api("admin/overview"));
      setMessage("تمت الأرشفة. يمكن الاسترجاع من تعديل السجل.");
    });
  }
  async function logout() {
    await act(async () => {
      await api("auth/logout", { method: "POST", body: "{}" });
      setUser(null);
      setData(null);
      window.location.replace("/login");
    });
  }
  const list = adminRecords(data, tab, {
    query: filter,
    status: statusFilter,
    subject: subjectFilter,
  });
  const pageCount = Math.max(1, Math.ceil(list.length / 20));
  const currentPage = Math.min(page, pageCount);
  const pageRecords = list.slice((currentPage - 1) * 20, currentPage * 20);
  function duplicate(entity, item) {
    const copy = {
      ...item,
      title: `${item.title} (نسخة)`.slice(0, 200),
      status: "draft",
    };
    delete copy._id;
    delete copy.upload;
    edit(entity, copy);
    setMessage(
      "نسخة جديدة كمسودة. راجع الروابط؛ المرفق المباشر يحتاج رفعه من جديد.",
    );
  }
  function Controls({ entity, item }) {
    return (
      <div className="row-actions">
        <button
          className="secondary small"
          disabled={entity === "subjects" && user.role === "editor"}
          onClick={() => edit(entity, item)}
        >
          تعديل
        </button>
        {["resources", "news"].includes(entity) && (
          <button
            className="secondary small"
            onClick={() => duplicate(entity, item)}
          >
            نسخ كمسودة
          </button>
        )}
        {entity !== "admins" &&
          !(entity === "subjects" && user.role === "editor") && (
            <button
              className="danger small"
              onClick={() =>
                setConfirmation({
                  entity,
                  id: item._id,
                  title: item.title || item.name,
                })
              }
            >
              أرشفة
            </button>
          )}
      </div>
    );
  }
  if (!user) return <main className="session-ended"><Notice error>انتهت جلستك. سجّل الدخول للمتابعة.</Notice><a className="button" href="/login">تسجيل الدخول</a></main>;
  return (
    <div
      className={`admin-layout control-app ${menuOpen ? "menu-open" : ""}`}
      data-accent="violet"
    >
      <div className="control-mobile-bar"><Brand href="/admin" subtitle="CONTROL" /><button className="secondary icon-button" aria-label={menuOpen ? "إغلاق قائمة الإدارة" : "فتح قائمة الإدارة"} aria-expanded={menuOpen} ref={menuButton} aria-controls="control-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? "close" : "menu"} /></button></div>
      {menuOpen && <button className="sidebar-backdrop" aria-label="إغلاق قائمة الإدارة" onClick={() => setMenuOpen(false)} />}
      <aside id="control-navigation" className="admin-sidebar">
        <Brand href="/admin" subtitle="CONTROL" />
        <div className="control-badge"><Icon name="shield" size={16} /> مساحة فريق المنصة</div>
        <p className="sidebar-label">إدارة المحتوى</p>
        <nav>
          {TABS.filter(
            ([id]) =>
              !["admins", "settings", "audit"].includes(id) ||
              user.role === "owner",
          ).map(([id, label, icon]) => (
            <button
              key={id}
              aria-current={tab === id ? "page" : undefined}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setMenuOpen(false);
                setFilter("");
                setStatusFilter("");
                setSubjectFilter("");
                setError("");
                setMessage("");
              }}
            >
              <Icon name={icon} size={20} />
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-user">
          <span className="avatar">{user.name[0]}</span>
          <div>
            <strong>{user.name}</strong>
            <span>{ROLES[user.role]}</span>
          </div>
        </div>
        <a className="secondary button" href={publicUrl} target="_blank" rel="noopener noreferrer">
          فتح منصة الطلبة ↗
        </a>
        <button className="text-button" disabled={pending} onClick={logout}>
          تسجيل الخروج
        </button>
      </aside>
      <main className="admin-main">
        <header className="admin-top">
          <div>
            <p className="eyebrow">
              لوحة الإدارة / {TABS.find((t) => t[0] === tab)?.[1]}
            </p>
            <h1>{tab === "overview" ? `أهلًا، ${user.name.split(" ")[0]}` : TABS.find((t) => t[0] === tab)?.[1]}</h1>
            <p className="control-context">{tab === "overview" ? "نظرة واضحة على منصتك. ابدأ بخطوة واحدة." : "مساحة منظّمة لإنجاز المهمة، بدون تشتيت."}</p>
          </div>
          <div className="admin-top-actions">
            <button
              className="secondary small"
              disabled={pending || loading}
              onClick={boot}
            >
              <Icon name="refresh" size={17} />
              تحديث
            </button>
            {["resources", "subjects", "news", "admins"].includes(tab) &&
              !(tab === "subjects" && user.role === "editor") && (
                <button onClick={() => edit(tab)}>
                  <Icon name="plus" size={19} />{" "}
                  {tab === "resources"
                    ? "إضافة محتوى"
                    : tab === "subjects"
                      ? "إضافة مادة"
                      : tab === "news"
                        ? "إعلان جديد"
                        : "إضافة أدمن"}
                </button>
              )}
          </div>
        </header>
        <Notice error>{error}</Notice>
        <Notice>{message}</Notice>
        {!data ? (
          <Empty title="جاري تحميل البيانات" />
        ) : (
          <>
            {tab === "overview" && (
              <>
                <div className="stats-grid">
                  {[
                    [
                      "المواد الدراسية",
                      data.subjects.filter((s) => s.active).length,
                      "book",
                    ],
                    [
                      "محتوى منشور",
                      data.resources.filter((r) => r.status === "published")
                        .length,
                      "file",
                    ],
                    [
                      "بانتظار النشر",
                      data.resources.filter((r) => r.status === "draft").length,
                      "grid",
                    ],
                    ["حجم الملفات المرفوعة", bytes(data.storageBytes), "file"],
                  ].map(([label, count, icon]) => (
                    <div className="stat-card" key={label}>
                      <span>
                        {label}
                        <Icon name={icon} size={19} />
                      </span>
                      <strong dir="auto">{count}</strong>
                    </div>
                  ))}
                </div>
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">خطوة بسيطة، محتوى جاهز</p>
                      <h2>انشر للطلبة</h2>
                    </div>
                  </div>
                  <div className="quick-actions">
                    <button
                      className="quick-card"
                      onClick={() => edit("resources")}
                    >
                      <Icon name="link" size={28} />
                      <h3>رابط أو ملف جديد</h3>
                      <p>Google Drive، تيليجرام، أو PDF حتى ٢ ميجابايت.</p>
                    </button>
                    <button className="quick-card" onClick={() => edit("news")}>
                      <Icon name="news" size={28} />
                      <h3>إعلان جديد</h3>
                      <p>اختار القسم والفرقة وثبّت الإعلانات المهمة.</p>
                    </button>
                  </div>
                </section>
                <section className="panel">
                  <h2>آخر المحتوى</h2>
                  {data.resources.length ? (
                    data.resources.slice(0, 5).map((r) => (
                      <div className="list-row" key={r._id}>
                        <span className="file-icon">
                          <Icon name="file" />
                        </span>
                        <div className="row-copy">
                          <strong>{r.title}</strong>
                          <span>
                            {
                              data.subjects.find((s) => s._id === r.subjectId)
                                ?.name
                            }{" "}
                            · {STATUSES[r.status]}
                          </span>
                        </div>
                        <button
                          className="text-button"
                          onClick={() => edit("resources", r)}
                        >
                          تعديل
                        </button>
                      </div>
                    ))
                  ) : (
                    <Empty title="ابدأ بإضافة مادة ثم محتواها">
                      كل محتوى جديد يبدأ كمسودة لحد ما تختار نشره.
                    </Empty>
                  )}
                </section>
              </>
            )}
            {["resources", "subjects", "news", "admins"].includes(tab) && (
              <section className="panel">
                <div className="filter-bar admin-filters">
                  <label className="search-box">
                    <Icon name="search" />
                    <input
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      placeholder="ابحث في السجلات…"
                      aria-label="بحث في السجلات"
                    />
                  </label>
                  <select
                    aria-label="حالة السجل"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="">كل الحالات</option>
                    {["subjects", "admins"].includes(tab) ? (
                      <>
                        <option value="active">
                          {tab === "subjects" ? "متاحة" : "نشط"}
                        </option>
                        <option value="inactive">
                          {tab === "subjects" ? "مؤرشفة" : "معطل"}
                        </option>
                      </>
                    ) : (
                      Object.entries(STATUSES).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))
                    )}
                  </select>
                  {tab === "resources" && (
                    <select
                      aria-label="تصفية حسب المادة"
                      value={subjectFilter}
                      onChange={(e) => setSubjectFilter(e.target.value)}
                    >
                      <option value="">كل المواد</option>
                      {data.subjects.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name} · {s.academicYear}
                        </option>
                      ))}
                    </select>
                  )}
                  {(filter || statusFilter || subjectFilter) && (
                    <button
                      className="text-button"
                      onClick={() => {
                        setFilter("");
                        setStatusFilter("");
                        setSubjectFilter("");
                      }}
                    >
                      مسح الفلاتر
                    </button>
                  )}
                </div>
                <p className="result-count">
                  {list.length} سجل · تشمل المسودات والمؤرشف
                </p>
                {list.length ? (
                  <div className="admin-list">
                    {pageRecords.map((item) => (
                      <article className="list-row" key={item._id}>
                        <span className="file-icon">
                          <Icon
                            name={
                              tab === "admins"
                                ? "user"
                                : tab === "subjects"
                                  ? "book"
                                  : tab === "news"
                                    ? "news"
                                    : "file"
                            }
                          />
                        </span>
                        <div className="row-copy">
                          <strong>{item.title || item.name}</strong>
                          <span>
                            {tab === "resources"
                              ? `${data.subjects.find((s) => s._id === item.subjectId)?.name || "—"} · ${KINDS[item.kind]} · ${STATUSES[item.status]}`
                              : tab === "subjects"
                                ? `${DEPARTMENTS.find((d) => d.id === item.department)?.name} · الفرقة ${item.year} · ترم ${item.term} · ${item.active ? "متاحة" : "مؤرشفة"}`
                                : tab === "admins"
                                  ? `${item.email} · ${ROLES[item.role]} · ${item.active ? "نشط" : "معطل"}`
                                  : STATUSES[item.status]}
                          </span>
                          {item.upload && (
                            <small dir="ltr">
                              PDF · {bytes(item.upload.bytes)}
                            </small>
                          )}
                        </div>
                        {!(tab === "admins" && item.role === "owner") &&
                          !(tab === "subjects" && user.role === "editor") && (
                            <Controls entity={tab} item={item} />
                          )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <Empty title="مفيش سجلات مطابقة">
                    أضف سجلًا جديدًا أو عدّل البحث.
                  </Empty>
                )}
                {pageCount > 1 && (
                  <nav className="pagination" aria-label="صفحات السجلات">
                    <button
                      className="secondary small"
                      disabled={currentPage === 1}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      السابق
                    </button>
                    <span>
                      صفحة {currentPage} من {pageCount}
                    </span>
                    <button
                      className="secondary small"
                      disabled={currentPage === pageCount}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      التالي
                    </button>
                  </nav>
                )}
              </section>
            )}
            {tab === "audit" && (
              <section className="panel">
                <p className="muted">
                  آخر ٥٠ عملية. بيانات كلمات المرور والجلسات لا تظهر في السجل.
                </p>
                {data.audits.map((a) => (
                  <div className="list-row" key={a._id}>
                    <Icon name="check" />
                    <div className="row-copy">
                      <strong>{a.actor}</strong>
                      <span>
                        {a.action} · {a.collection} · {a.recordId}
                      </span>
                    </div>
                    <time>{new Date(a.createdAt).toLocaleString("ar-EG")}</time>
                  </div>
                ))}
              </section>
            )}
            {tab === "settings" && (
              <Settings
                settings={data.settings}
                onSave={async (draft) => {
                  await api("admin/settings", {
                    method: "PUT",
                    body: JSON.stringify(draft),
                  });
                  const next = await api("admin/overview");
                  setData(next);
                  return next.settings;
                }}
              />
            )}
            {tab === "security" && (
              <AccountSecurity
                onChanged={async () => {
                  const result = await api("auth/session");
                  setUser(result.user);
                  setData(await api("admin/overview"));
                }}
              />
            )}
          </>
        )}
      </main>
      {editing && (
        <Modal
          title={`${editing.id ? "تعديل" : "إضافة"} ${editing.entity === "resources" ? "محتوى" : editing.entity === "subjects" ? "مادة" : editing.entity === "news" ? "إعلان" : "أدمن"}`}
          onClose={() => {
            if (!pending) setEditing(null);
          }}
        >
          <Notice error>{error}</Notice>
          <Notice>{message}</Notice>
          <form onSubmit={save}>
            <div className="form-grid">
              {editing.entity === "subjects" && (
                <>
                  <Field label="اسم المادة">
                    <input
                      required
                      maxLength={150}
                      value={form.name}
                      onChange={(e) => change("name", e.target.value)}
                    />
                  </Field>
                  <Field label="كود المادة (اختياري)">
                    <input
                      maxLength={40}
                      value={form.code}
                      onChange={(e) => change("code", e.target.value)}
                    />
                  </Field>
                  <Field label="القسم">
                    <select
                      value={form.department}
                      onChange={(e) => change("department", e.target.value)}
                    >
                      {DEPARTMENTS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="الفرقة">
                    <select
                      value={form.year}
                      onChange={(e) => change("year", e.target.value)}
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="الترم">
                    <select
                      value={form.term}
                      onChange={(e) => change("term", e.target.value)}
                    >
                      <option>1</option>
                      <option>2</option>
                    </select>
                  </Field>
                  <Field label="السنة الدراسية">
                    <input
                      required
                      maxLength={20}
                      value={form.academicYear}
                      onChange={(e) => change("academicYear", e.target.value)}
                    />
                  </Field>
                  <Field label="المحاضر (اختياري)">
                    <input
                      maxLength={150}
                      value={form.lecturer}
                      onChange={(e) => change("lecturer", e.target.value)}
                    />
                  </Field>
                  <Field label="المجموعة (اختياري)">
                    <input
                      maxLength={40}
                      value={form.group}
                      onChange={(e) => change("group", e.target.value)}
                    />
                  </Field>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => change("active", e.target.checked)}
                    />
                    المادة متاحة للطلبة
                  </label>
                </>
              )}
              {editing.entity === "resources" && (
                <>
                  <Field label="عنوان المحتوى">
                    <input
                      required
                      maxLength={200}
                      value={form.title}
                      onChange={(e) => change("title", e.target.value)}
                    />
                  </Field>
                  <Field label="المادة">
                    <select
                      required
                      value={form.subjectId}
                      onChange={(e) => change("subjectId", e.target.value)}
                    >
                      <option value="">اختار المادة</option>
                      {data.subjects
                        .filter((s) => s.active)
                        .map((s) => (
                          <option key={s._id} value={s._id}>
                            {s.name} · {s.academicYear}
                            {s.group ? ` · ${s.group}` : ""}
                          </option>
                        ))}
                    </select>
                  </Field>
                  <Field label="رقم المحاضرة (٠ للمحتوى العام)">
                    <input
                      required
                      type="number"
                      min="0"
                      max="100"
                      value={form.lecture}
                      onChange={(e) => change("lecture", e.target.value)}
                    />
                  </Field>
                  <Field label="نوع المحتوى">
                    <select
                      value={form.kind}
                      onChange={(e) => change("kind", e.target.value)}
                    >
                      {Object.entries(KINDS).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="وصف المحتوى">
                    <textarea
                      maxLength={2000}
                      value={form.description}
                      onChange={(e) => change("description", e.target.value)}
                    />
                  </Field>
                  <Field label="المصدر / صاحب المحتوى">
                    <input
                      maxLength={250}
                      value={form.source}
                      onChange={(e) => change("source", e.target.value)}
                    />
                  </Field>
                  <div className="upload-box">
                    <Field label="روابط Google Drive أو رسائل تيليجرام">
                      <textarea
                        dir="ltr"
                        rows={3}
                        value={linkText}
                        onChange={(e) => setLinkText(e.target.value)}
                        placeholder="https://drive.google.com/file/d/…/view"
                      />
                    </Field>
                    <p className="muted">
                      رابط في كل سطر، حتى ٤ روابط. تأكد من صلاحيات المشاركة.
                    </p>
                    <span className="divider-label">أو أرفق ملفًا خفيفًا</span>
                    <Field
                      label={
                        form.upload
                          ? "استبدال PDF الحالي (اختياري)"
                          : "PDF حتى ٢ ميجابايت"
                      }
                    >
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f?.size > UPLOAD_LIMIT) {
                            setError(
                              "الملف أكبر من ٢ ميجابايت. استخدم رابطًا خارجيًا.",
                            );
                            e.target.value = "";
                            setFile(null);
                          } else {
                            setError("");
                            setFile(f || null);
                          }
                        }}
                      />
                    </Field>
                    {form.upload && (
                      <p>
                        المرفق الحالي: {form.upload.filename} ·{" "}
                        <bdi>{bytes(form.upload.bytes)}</bdi>
                      </p>
                    )}
                  </div>
                </>
              )}
              {editing.entity === "news" && (
                <>
                  <Field label="عنوان الإعلان">
                    <input
                      required
                      maxLength={200}
                      value={form.title}
                      onChange={(e) => change("title", e.target.value)}
                    />
                  </Field>
                  <Field label="نص الإعلان">
                    <textarea
                      required
                      rows={5}
                      maxLength={6000}
                      value={form.body}
                      onChange={(e) => change("body", e.target.value)}
                    />
                  </Field>
                  <Field label="القسم المستهدف">
                    <select
                      value={form.department}
                      onChange={(e) => change("department", e.target.value)}
                    >
                      <option value="">كل الأقسام</option>
                      {DEPARTMENTS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="الفرقة المستهدفة">
                    <select
                      value={form.year}
                      onChange={(e) => change("year", e.target.value)}
                    >
                      <option value="0">كل الفرق</option>
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="رابط المصدر (اختياري)">
                    <input
                      type="url"
                      dir="ltr"
                      value={form.sourceUrl}
                      onChange={(e) => change("sourceUrl", e.target.value)}
                    />
                  </Field>
                  <Field label="انتهاء الإعلان (اختياري)">
                    <input
                      type="date"
                      value={form.expiresAt}
                      onChange={(e) => change("expiresAt", e.target.value)}
                    />
                  </Field>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={form.pinned}
                      onChange={(e) => change("pinned", e.target.checked)}
                    />
                    تثبيت الإعلان
                  </label>
                </>
              )}
              {editing.entity === "admins" && (
                <>
                  <Field label="الاسم">
                    <input
                      required
                      maxLength={120}
                      value={form.name}
                      onChange={(e) => change("name", e.target.value)}
                    />
                  </Field>
                  <Field label="البريد الإلكتروني">
                    <input
                      required
                      type="email"
                      dir="ltr"
                      disabled={Boolean(editing.id)}
                      value={form.email}
                      onChange={(e) => change("email", e.target.value)}
                    />
                  </Field>
                  <Field
                    label={
                      editing.id
                        ? "كلمة مرور جديدة (اختياري)"
                        : "كلمة المرور (١٢ حرفًا على الأقل)"
                    }
                  >
                    <input
                      type="password"
                      required={!editing.id}
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                      value={form.password || ""}
                      onChange={(e) => change("password", e.target.value)}
                    />
                  </Field>
                  <Field label="الصلاحية">
                    <select
                      value={form.role}
                      onChange={(e) => change("role", e.target.value)}
                    >
                      <option value="editor">محرر محتوى</option>
                      <option value="admin">أدمن</option>
                    </select>
                  </Field>
                  {editing.id && (
                    <label className="checkbox">
                      <input
                        type="checkbox"
                        checked={form.active}
                        onChange={(e) => change("active", e.target.checked)}
                      />
                      الحساب نشط
                    </label>
                  )}
                  <p className="muted">
                    المحرر يدير المحتوى والإعلانات. الأدمن يدير المواد أيضًا.
                    المالك يدير الحسابات والإعدادات. تحديث الحساب يلغي جلساته
                    الحالية.
                  </p>
                </>
              )}
              {["resources", "news"].includes(editing.entity) && (
                <Field label="حالة النشر">
                  <select
                    value={form.status}
                    onChange={(e) => change("status", e.target.value)}
                  >
                    {Object.entries(STATUSES).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <div className="form-actions">
              <button disabled={pending}>
                {pending ? "جاري الحفظ…" : "حفظ التغييرات"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={pending}
                onClick={() => setEditing(null)}
              >
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title="أرشفة السجل"
          onClose={() => {
            if (!pending) setConfirmation(null);
          }}
        >
          <p>
            أرشفة «{confirmation.title}» هتخفيه عن الطلبة. تقدر تسترجعه من
            التعديل.
          </p>
          <Notice error>{error}</Notice>
          <div className="form-actions">
            <button className="danger" disabled={pending} onClick={archive}>
              تأكيد الأرشفة
            </button>
            <button
              className="secondary"
              disabled={pending}
              onClick={() => setConfirmation(null)}
            >
              إلغاء
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
