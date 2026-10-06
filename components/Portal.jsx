"use client";
import { useEffect, useMemo, useState } from "react";
import {
  api,
  Brand,
  Icon,
  Notice,
  Empty,
  KINDS,
  bytes,
  Modal,
  Field,
} from "./shared";
import { DEPARTMENTS, normalize } from "../lib/validation.mjs";
const YEARS = ["الأولى", "الثانية", "الثالثة", "الرابعة"];
const SOURCES = [
  {
    title: "موقع المعهد",
    label: "الأقسام والخدمات والمعلومات الرسمية",
    url: "https://eia.edu.eg/",
  },
  {
    title: "النتائج",
    label: "فتح بوابة النتائج الأصلية",
    url: "https://results.eia.edu.eg/index.php",
  },
  {
    title: "شروط القبول",
    label: "متطلبات القيد والالتحاق",
    url: "https://eia.edu.eg/ar/enrollment/requirements",
  },
  {
    title: "هيئة التدريس",
    label: "الدليل على الموقع الرسمي",
    url: "https://eia.edu.eg/ar/about/faculty-members",
  },
  {
    title: "أخبار المعهد",
    label: "الإعلانات من مصدرها",
    url: "https://eia.edu.eg/ar/news/",
  },
  {
    title: "مكان المعهد",
    label: "فتح الموقع في Google Maps",
    url: "https://maps.app.goo.gl/snh6UyWtH6DxNLa67",
  },
  {
    title: "صفحة فيسبوك المرفقة",
    label: "فتح الرابط الخارجي",
    url: "https://www.facebook.com/share/19YRc4SheU/",
  },
];
export default function Portal() {
  const [tab, setTab] = useState("home"),
    [catalog, setCatalog] = useState({ subjects: [], resources: [], news: [] }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [profile, setProfile] = useState({
      department: "bis",
      year: "3",
      term: "1",
      academicYear: "2026/2027",
      group: "",
    }),
    [profileOpen, setProfileOpen] = useState(false),
    [saved, setSaved] = useState([]),
    [q, setQ] = useState(""),
    [subject, setSubject] = useState(""),
    [kind, setKind] = useState(""),
    [view, setView] = useState(null),
    [ready, setReady] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      setCatalog(await api("public/catalog"));
    } catch (e) {
      setError(
        e.status === 503
          ? "المكتبة غير متاحة مؤقتًا. جرّب مرة تانية لاحقًا."
          : e.message,
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    try {
      const p = JSON.parse(localStorage.getItem("eia_profile"));
      const s = JSON.parse(localStorage.getItem("eia_saved"));
      if (
        p &&
        DEPARTMENTS.some((d) => d.id === p.department) &&
        ["1", "2", "3", "4"].includes(p.year) &&
        ["1", "2"].includes(p.term)
      )
        setProfile({
          department: p.department,
          year: p.year,
          term: p.term,
          academicYear:
            typeof p.academicYear === "string" ? p.academicYear : "2026/2027",
          group: typeof p.group === "string" ? p.group : "",
        });
      if (Array.isArray(s)) setSaved(s.filter((x) => typeof x === "string"));
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem("eia_profile", JSON.stringify(profile));
        localStorage.setItem("eia_saved", JSON.stringify(saved));
      } catch {
        /* Keep navigation usable when browser storage is unavailable. */
      }
    }
  }, [profile, saved, ready]);
  const mySubjects = useMemo(
    () =>
      catalog.subjects.filter(
        (s) =>
          s.department === profile.department &&
          s.year === Number(profile.year) &&
          s.term === Number(profile.term) &&
          s.academicYear === profile.academicYear &&
          (!profile.group || !s.group || s.group === profile.group),
      ),
    [catalog, profile],
  );
  const available = useMemo(() => {
    const ids = new Set(mySubjects.map((s) => s._id));
    return catalog.resources.filter((r) => ids.has(r.subjectId));
  }, [catalog, mySubjects]);
  const news = catalog.news.filter(
    (n) =>
      (!n.department || n.department === profile.department) &&
      (!n.year || n.year === Number(profile.year)),
  );
  const filtered = useMemo(() => {
    let list =
      tab === "saved"
        ? catalog.resources.filter((r) => saved.includes(r._id))
        : available;
    const term = normalize(q);
    return list.filter(
      (r) =>
        (!subject || r.subjectId === subject) &&
        (!kind || r.kind === kind) &&
        (!term ||
          normalize(
            `${r.title} ${r.description} ${r.source} ${catalog.subjects.find((s) => s._id === r.subjectId)?.name || ""}`,
          ).includes(term)),
    );
  }, [tab, catalog, saved, available, q, subject, kind]);
  function navigate(next) {
    setTab(next);
    setQ("");
    setSubject("");
    setKind("");
  }
  function toggleSave(id) {
    setSaved((list) =>
      list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
    );
  }
  const dep = DEPARTMENTS.find((d) => d.id === profile.department);
  function card(r) {
    const s = catalog.subjects.find((s) => s._id === r.subjectId);
    return (
      <article className="resource-card" key={r._id}>
        <div className="resource-top">
          <span className={`file-icon ${r.kind}`}>
            <Icon name="file" size={27} />
          </span>
          <span className="tag">{KINDS[r.kind]}</span>
          <button
            className={`icon-button bookmark ${saved.includes(r._id) ? "selected" : ""}`}
            aria-label={
              saved.includes(r._id) ? "إزالة من المحفوظات" : "حفظ الملف"
            }
            aria-pressed={saved.includes(r._id)}
            onClick={() => toggleSave(r._id)}
          >
            <Icon name="save" />
          </button>
        </div>
        <p className="eyebrow">
          {s?.name}
          {r.lecture > 0 ? ` · محاضرة ${r.lecture}` : ""}
        </p>
        <h3>{r.title}</h3>
        <p className="card-description">
          {r.description || "افتح تفاصيل المحتوى وروابط الوصول."}
        </p>
        <div className="resource-meta">
          <span>{r.upload ? bytes(r.upload.bytes) : "رابط خارجي"}</span>
          <time dateTime={r.updatedAt}>
            {new Date(r.updatedAt).toLocaleDateString("ar-EG")}
          </time>
        </div>
        <button className="resource-open secondary" onClick={() => setView(r)}>
          فتح المحتوى <Icon name="arrow" size={18} />
        </button>
      </article>
    );
  }
  function resourceGrid(list) {
    return list.length ? (
      <div className="resource-grid">{list.map(card)}</div>
    ) : (
      <Empty title={q ? "مفيش نتائج مطابقة" : "مفيش ملفات متاحة حاليًا"}>
        {q
          ? "جرّب اسم مادة أو كلمة أقصر."
          : "المحتوى المنشور هيظهر هنا بمجرد إضافته من الإدارة."}
      </Empty>
    );
  }
  return (
    <>
      <header className="site-header">
        <div className="header-inner">
          <Brand title={catalog.settings?.title} />
          <nav className="desktop-nav" aria-label="التنقل الرئيسي">
            {[
              ["home", "الرئيسية"],
              ["subjects", "موادي"],
              ["library", "المكتبة"],
              ["news", "الإعلانات"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                onClick={() => navigate(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <button
              className="profile-pill"
              onClick={() => setProfileOpen(true)}
            >
              <Icon name="user" size={17} />
              <span>
                {YEARS[Number(profile.year) - 1]} · {dep?.name}
              </span>
            </button>
            <a className="admin-link" href="/admin" aria-label="لوحة الإدارة">
              <Icon name="grid" size={19} />
            </a>
          </div>
        </div>
      </header>
      <main className="container">
        {error && (
          <Notice error>
            {error}{" "}
            <button className="text-button" onClick={load}>
              إعادة المحاولة
            </button>
          </Notice>
        )}
        {tab === "home" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="small-label">
                  <span className="dot" /> مساحة طلابية مستقلة
                </span>
                <h1>
                  كل محاضرة.
                  <br />
                  <span>في مكانها.</span>
                </h1>
                <p>
                  {catalog.settings?.description ||
                    "موادك ومحاضراتك وروابطك المهمة، جاهزة لما تحتاجها. اختار مسارك الدراسي وابدأ من هنا."}
                </p>
                <div className="hero-actions">
                  <button onClick={() => navigate("library")}>
                    افتح المكتبة <Icon name="arrow" size={19} />
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setProfileOpen(true)}
                  >
                    اختار موادي
                  </button>
                </div>
              </div>
              <div className="hero-note">
                <div className="note-head">
                  <Icon name="book" />
                  <span>مسارك الدراسي</span>
                  <span className="tag mint">ترم {profile.term}</span>
                </div>
                <h2>{dep?.name}</h2>
                <p>الفرقة {YEARS[Number(profile.year) - 1]}</p>
                <div className="note-lines">
                  <div>
                    <span>المواد المتاحة</span>
                    <strong>{mySubjects.length}</strong>
                  </div>
                  <div>
                    <span>المحتوى المنشور</span>
                    <strong>{available.length}</strong>
                  </div>
                  <div>
                    <span>ملفاتك المحفوظة</span>
                    <strong>{saved.length}</strong>
                  </div>
                </div>
                <button
                  className="text-button"
                  onClick={() => setProfileOpen(true)}
                >
                  تغيير المسار ←
                </button>
              </div>
            </section>
            <div className="section-heading">
              <div>
                <p className="eyebrow">ابدأ من آخر إضافة</p>
                <h2>جديد موادك</h2>
              </div>
              <button
                className="text-button"
                onClick={() => navigate("library")}
              >
                كل المحتوى ←
              </button>
            </div>
            {loading ? (
              <div className="skeleton-grid" aria-label="جاري التحميل">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="skeleton" />
                ))}
              </div>
            ) : (
              resourceGrid(available.slice(0, 6))
            )}
            <section className="announcement-strip">
              <div>
                <Icon name="news" />
                <div>
                  <h3>{news[0]?.title || "الإعلانات المهمة، قدامك"}</h3>
                  <p>
                    {news[0]?.body?.slice(0, 130) ||
                      "تابع إعلانات قسمك وفرقتك من مكان واحد."}
                  </p>
                </div>
              </div>
              <button className="secondary" onClick={() => navigate("news")}>
                الإعلانات
              </button>
            </section>
            <div className="section-heading">
              <div>
                <p className="eyebrow">المصادر الأصلية</p>
                <h2>روابط هتحتاجها</h2>
              </div>
            </div>
            <div className="sources-grid">
              {SOURCES.slice(0, 4).map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="source-card"
                >
                  <Icon name="link" />
                  <h3>{s.title}</h3>
                  <p>{s.label}</p>
                  <span>فتح المصدر ↗</span>
                </a>
              ))}
            </div>
          </>
        )}
        {["library", "saved"].includes(tab) && (
          <>
            <section className="page-intro">
              <p className="eyebrow">
                {dep?.name} · الفرقة {YEARS[Number(profile.year) - 1]}
              </p>
              <h1>{tab === "saved" ? "محفوظاتك" : "المكتبة الدراسية"}</h1>
              <p>
                {tab === "saved"
                  ? "المحتوى اللي اخترت ترجع له. الحفظ على هذا الجهاز."
                  : "محاضرات وملخصات وتدريبات، مرتبة حسب موادك."}
              </p>
            </section>
            <div className="filter-bar">
              <label className="search-box">
                <Icon name="search" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ابحث بالعنوان أو المادة…"
                  aria-label="بحث في المكتبة"
                />
              </label>
              <select
                aria-label="المادة"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              >
                <option value="">كل المواد</option>
                {(tab === "saved" ? catalog.subjects : mySubjects).map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="نوع المحتوى"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="">كل الأنواع</option>
                {Object.entries(KINDS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <p className="result-count">
              {loading ? "جاري التحميل…" : `${filtered.length} محتوى متاح`}
            </p>
            {resourceGrid(filtered)}
          </>
        )}
        {tab === "subjects" && (
          <>
            <section className="page-intro">
              <p className="eyebrow">ترم {profile.term}</p>
              <h1>موادي</h1>
              <p>
                {dep?.name} · الفرقة {YEARS[Number(profile.year) - 1]}
              </p>
              <button
                className="secondary"
                onClick={() => setProfileOpen(true)}
              >
                تغيير المسار الدراسي
              </button>
            </section>
            {mySubjects.length ? (
              <div className="subjects-grid">
                {mySubjects.map((s, i) => (
                  <button
                    className="subject-card"
                    key={s._id}
                    onClick={() => {
                      navigate("library");
                      setSubject(s._id);
                    }}
                  >
                    <span className="subject-number">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <h2>{s.name}</h2>
                    <p>
                      {[
                        s.lecturer,
                        s.group && `مجموعة ${s.group}`,
                        s.academicYear,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <span>
                      {available.filter((r) => r.subjectId === s._id).length}{" "}
                      ملف وروابط <Icon name="arrow" size={18} />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty title="مواد المسار ده لسه متضافتش">
                اختار مسارًا آخر أو ارجع بعد إضافة المحتوى.
              </Empty>
            )}
          </>
        )}
        {tab === "news" && (
          <>
            <section className="page-intro">
              <p className="eyebrow">متابعة من مكان واحد</p>
              <h1>الإعلانات</h1>
              <p>الإعلانات المنشورة لقسمك وفرقتك.</p>
            </section>
            {news.length ? (
              <div className="news-list">
                {news.map((n) => (
                  <article key={n._id} className="news-card">
                    <div className="news-meta">
                      <span className={`tag ${n.pinned ? "mint" : ""}`}>
                        {n.pinned ? "مثبّت" : "إعلان"}
                      </span>
                      <time>
                        {new Date(n.createdAt).toLocaleDateString("ar-EG")}
                      </time>
                    </div>
                    <h2>{n.title}</h2>
                    <p>{n.body}</p>
                    {n.sourceUrl && (
                      <a
                        className="text-button"
                        href={n.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        فتح مصدر الإعلان ↗
                      </a>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <Empty title="مفيش إعلانات حالية">
                الإعلانات المناسبة لمسارك هتظهر هنا.
              </Empty>
            )}
          </>
        )}
        {tab === "sources" && (
          <>
            <section className="page-intro">
              <p className="eyebrow">المعهد المصري لأكاديمية الإسكندرية</p>
              <h1>المصادر والخدمات</h1>
              <p>الروابط تفتح المواقع الأصلية خارج المنصة.</p>
            </section>
            <div className="sources-grid">
              {SOURCES.map((s) => (
                <a
                  key={s.url}
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="source-card"
                >
                  <Icon name="link" />
                  <h3>{s.title}</h3>
                  <p>{s.label}</p>
                  <span>فتح المصدر ↗</span>
                </a>
              ))}
            </div>
          </>
        )}
      </main>
      <footer className="site-footer container">
        <Brand title={catalog.settings?.title} />
        <p>
          منصة طلابية مستقلة، غير تابعة رسميًا للمعهد. حقوق المحتوى لأصحابه.
        </p>
        <div>
          <button className="text-button" onClick={() => navigate("saved")}>
            المحفوظات
          </button>
          <button className="text-button" onClick={() => navigate("sources")}>
            المصادر والخدمات
          </button>
          <a href="/admin">الإدارة</a>
        </div>
      </footer>
      <nav className="mobile-nav" aria-label="التنقل على الموبايل">
        {[
          ["home", "grid", "الرئيسية"],
          ["subjects", "book", "موادي"],
          ["library", "search", "المكتبة"],
          ["news", "news", "الإعلانات"],
          ["saved", "save", "محفوظاتي"],
        ].map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => navigate(id)}
            className={tab === id ? "active" : ""}
          >
            <Icon name={icon} size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      {profileOpen && (
        <Modal title="مسارك الدراسي" onClose={() => setProfileOpen(false)}>
          <p className="muted">
            اختياراتك محفوظة على الجهاز. تقدر تغيّرها في أي وقت.
          </p>
          <div className="form-grid">
            <Field label="السنة الدراسية">
              <select
                value={profile.academicYear}
                onChange={(e) => {
                  setProfile({
                    ...profile,
                    academicYear: e.target.value,
                    group: "",
                  });
                  setSubject("");
                }}
              >
                {[
                  ...new Set([
                    profile.academicYear,
                    ...catalog.subjects.map((s) => s.academicYear),
                  ]),
                ]
                  .sort()
                  .reverse()
                  .map((y) => (
                    <option key={y}>{y}</option>
                  ))}
              </select>
            </Field>
            <Field label="المجموعة">
              <select
                value={profile.group}
                onChange={(e) => {
                  setProfile({ ...profile, group: e.target.value });
                  setSubject("");
                }}
              >
                <option value="">كل المجموعات</option>
                {[
                  ...new Set(
                    catalog.subjects
                      .filter(
                        (s) =>
                          s.department === profile.department &&
                          s.year === Number(profile.year) &&
                          s.term === Number(profile.term) &&
                          s.academicYear === profile.academicYear,
                      )
                      .map((s) => s.group)
                      .filter(Boolean),
                  ),
                ]
                  .sort()
                  .map((g) => (
                    <option key={g}>{g}</option>
                  ))}
              </select>
            </Field>
            <Field label="القسم">
              <select
                value={profile.department}
                onChange={(e) => {
                  setProfile({
                    ...profile,
                    department: e.target.value,
                    group: "",
                  });
                  setSubject("");
                }}
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
                value={profile.year}
                onChange={(e) => {
                  setProfile({ ...profile, year: e.target.value, group: "" });
                  setSubject("");
                }}
              >
                {YEARS.map((y, i) => (
                  <option key={y} value={String(i + 1)}>
                    {y}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="الترم">
              <select
                value={profile.term}
                onChange={(e) => {
                  setProfile({ ...profile, term: e.target.value, group: "" });
                  setSubject("");
                }}
              >
                <option value="1">الأول</option>
                <option value="2">الثاني</option>
              </select>
            </Field>
          </div>
          <button className="full" onClick={() => setProfileOpen(false)}>
            حفظ الاختيارات <Icon name="check" size={18} />
          </button>
        </Modal>
      )}
      {view && (
        <Modal title={view.title} onClose={() => setView(null)}>
          <p className="muted">{view.description}</p>
          {view.source && (
            <p className="source-note">المصدر / صاحب المحتوى: {view.source}</p>
          )}
          {view.upload && (
            <div className="access-option">
              <span>
                <Icon name="file" /> PDF · <bdi>{bytes(view.upload.bytes)}</bdi>
              </span>
              <div>
                <a
                  className="button"
                  href={`/api/public/file/${view._id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  قراءة PDF ↗
                </a>
                <a
                  className="button secondary"
                  href={`/api/public/file/${view._id}?download=1`}
                >
                  تنزيل
                </a>
              </div>
            </div>
          )}
          {view.links.map((link, i) => (
            <div key={link.url} className="access-option">
              <div>
                <strong>
                  {link.provider === "drive" ? "Google Drive" : "Telegram"}
                  {i > 0 ? " · رابط بديل" : ""}
                </strong>
                <p>
                  {link.provider === "drive"
                    ? "قد يتطلب الوصول إذن مشاركة من صاحب الملف."
                    : link.private
                      ? "الرابط خاص، ويحتاج عضوية القناة أو المجموعة."
                      : "يفتح الرسالة الأصلية لتحميل الملف من تيليجرام."}
                </p>
              </div>
              <a
                className="button secondary"
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                فتح الرابط ↗
              </a>
            </div>
          ))}
          <button className="text-button" onClick={() => toggleSave(view._id)}>
            {saved.includes(view._id)
              ? "إزالة من المحفوظات"
              : "حفظ للرجوع إليه"}
          </button>
        </Modal>
      )}
    </>
  );
}
