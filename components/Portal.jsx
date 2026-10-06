"use client";
import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
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
import { resourceShareUrl, sortResources } from "../lib/catalog.mjs";
import { useTelemetry, PrivacyPanel, AdSlot } from "./Telemetry";
const PwaTools=lazy(()=>import("./PwaTools"));
const StudentAccount = lazy(() => import("./StudentAccount"));
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
    [ready, setReady] = useState(false),
    [completed, setCompleted] = useState([]),
    [order, setOrder] = useState("newest"),
    [lecture, setLecture] = useState(""),
    [progressFilter, setProgressFilter] = useState(""),
    [message, setMessage] = useState(""),
    [shareUrl, setShareUrl] = useState("");
  const [student, setStudent] = useState(null), [accountOpen, setAccountOpen] = useState(false), [cloudStatus, setCloudStatus] = useState("saved"), [emailVerificationAvailable, setEmailVerificationAvailable] = useState(false);
  const cloudVersion = useRef(0), cloudSerialized = useRef(null), cloudPaused = useRef(false), cloudBusy = useRef(false), switchingAccount = useRef(false), studentId = useRef(null);
  studentId.current = student?._id;
  const metrics = useTelemetry(tab);
  function applyAccount(snapshot) {
    cloudPaused.current = false;
    setStudent(snapshot.user);
    setEmailVerificationAvailable(Boolean(snapshot.emailVerificationAvailable));
    cloudVersion.current = snapshot.state?.version || 0;
    if (snapshot.user) {
      const value = snapshot.state || { profile, saved: [], completed: [] };
      cloudSerialized.current = JSON.stringify({ profile: value.profile, saved: value.saved || [], completed: value.completed || [] });
      setProfile(value.profile); setSaved(value.saved || []); setCompleted(value.completed || []);
    } else {
      cloudSerialized.current = null;
      try {
        const guestProfile = JSON.parse(localStorage.getItem("eia_profile"));
        if (guestProfile && DEPARTMENTS.some(d=>d.id===guestProfile.department) && ["1","2","3","4"].includes(guestProfile.year) && ["1","2"].includes(guestProfile.term)) setProfile(guestProfile);
        const guestSaved = JSON.parse(localStorage.getItem("eia_saved")), guestCompleted = JSON.parse(localStorage.getItem("eia_completed"));
        setSaved(Array.isArray(guestSaved) ? guestSaved.filter(x=>typeof x==='string') : []);
        setCompleted(Array.isArray(guestCompleted) ? guestCompleted.filter(x=>typeof x==='string') : []);
      } catch { setSaved([]); setCompleted([]); }
    }
    setCloudStatus("saved");
  }
  useEffect(() => { api("student/session").then(applyAccount).catch(()=>{}); }, []);
  useEffect(() => {
    if (!student || !ready || cloudPaused.current || switchingAccount.current) return;
    const value = JSON.stringify({profile, saved, completed}), id = student._id;
    if (value === cloudSerialized.current) return;
    let stopped = false, timer;
    setCloudStatus("pending");
    const flush = async () => {
      if (stopped || studentId.current !== id || switchingAccount.current || cloudPaused.current) return;
      if (cloudBusy.current) { timer = setTimeout(flush, 300); return; }
      cloudBusy.current = true;
      try {
        const result = await api("student/state", {method:"PUT", body:JSON.stringify({...JSON.parse(value),version:cloudVersion.current})});
        if (studentId.current === id) { cloudVersion.current = result.version; cloudSerialized.current = value; if (!stopped) setCloudStatus("saved"); }
      } catch (e) { if(studentId.current === id) { cloudPaused.current = true; setCloudStatus("error"); setMessage(e.status===409?e.message:"تعذّرت المزامنة. افتح حسابك وأعد تحميل بياناته."); } }
      finally { cloudBusy.current = false; }
    };
    timer = setTimeout(flush, 800);
    return () => { stopped = true; clearTimeout(timer); };
  }, [profile, saved, completed, student?._id, ready]);
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
      const c = JSON.parse(localStorage.getItem("eia_completed"));
      if (Array.isArray(c))
        setCompleted(c.filter((x) => typeof x === "string"));
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
    if (ready && !student && !switchingAccount.current) {
      try {
        localStorage.setItem("eia_profile", JSON.stringify(profile));
        localStorage.setItem("eia_saved", JSON.stringify(saved));
        localStorage.setItem("eia_completed", JSON.stringify(completed));
      } catch {
        /* Keep navigation usable when browser storage is unavailable. */
      }
    }
  }, [profile, saved, completed, ready, student?._id]);
  useEffect(() => {
    if (loading || error) return;
    function restoreResource() {
      const id = new URL(window.location.href).searchParams.get("resource");
      if (!id) {
        setView(null);
        return;
      }
      const resource = catalog.resources.find((r) => r._id === id);
      setTab("library");
      setView(resource || null);
      setShareUrl("");
      setMessage(
        resource
          ? ""
          : "المحتوى اللي في الرابط غير متاح حاليًا؛ ممكن يكون اتأرشف أو لم يُنشر.",
      );
    }
    restoreResource();
    window.addEventListener("popstate", restoreResource);
    return () => window.removeEventListener("popstate", restoreResource);
  }, [catalog, loading, error]);
  function closeResource() {
    setView(null);
    setShareUrl("");
    setMessage("");
    const url = new URL(window.location.href);
    url.searchParams.delete("resource");
    window.history.replaceState(null, "", url);
  }
  function openResource(resource) {
    metrics.track("resource_open", resource._id);
    setView(resource);
    setShareUrl("");
    setMessage("");
    window.history.pushState(
      null,
      "",
      resourceShareUrl(window.location.origin, resource._id),
    );
  }
  async function shareResource(resource) {
    const url = resourceShareUrl(window.location.origin, resource._id);
    setShareUrl(url);
    try {
      if (navigator.share)
        await navigator.share({ title: resource.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage("تم نسخ رابط المحتوى.");
      }
    } catch (e) {
      if (e.name !== "AbortError")
        setMessage("تقدر تنسخ الرابط من الخانة وتبعته لزمايلك.");
    }
  }
  function toggleComplete(id) {
    setCompleted((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );
  }
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
    return sortResources(
      list.filter(
        (r) =>
          (!subject || r.subjectId === subject) &&
          (!kind || r.kind === kind) &&
          (lecture === "" || r.lecture === Number(lecture)) &&
          (!progressFilter ||
            completed.includes(r._id) === (progressFilter === "done")) &&
          (!term ||
            normalize(
              `${r.title} ${r.description} ${r.source} ${catalog.subjects.find((s) => s._id === r.subjectId)?.name || ""}`,
            ).includes(term)),
      ),
      order,
    );
  }, [
    tab,
    catalog,
    saved,
    available,
    q,
    subject,
    kind,
    lecture,
    progressFilter,
    completed,
    order,
  ]);
  function navigate(next) {
    setTab(next);
    setQ("");
    setSubject("");
    setKind("");
    setLecture("");
    setProgressFilter("");
    closeResource();
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
        {completed.includes(r._id) && (
          <span className="completed-label">
            <Icon name="check" size={15} />
            تمت المذاكرة
          </span>
        )}
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
        <button
          className="resource-open secondary"
          onClick={() => openResource(r)}
        >
          فتح المحتوى <Icon name="arrow" size={18} />
        </button>
      </article>
    );
  }
  function resourceGrid(list) {
    return list.length ? (
      <div className="resource-grid">{list.map(card)}</div>
    ) : (
      <Empty
        title={
          q || subject || kind || lecture || progressFilter
            ? "مفيش نتائج مطابقة"
            : "مفيش ملفات متاحة حاليًا"
        }
      >
        {q || subject || kind || lecture || progressFilter
          ? "جرّب بحثًا مختلفًا أو امسح الفلاتر."
          : "المحتوى المنشور هيظهر هنا بمجرد إضافته من الإدارة."}
      </Empty>
    );
  }
  return (
    <div className="student-app" data-accent={catalog.settings?.accent || "emerald"}>
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
                aria-current={tab === id ? "page" : undefined}
                className={tab === id ? "active" : ""}
                onClick={() => navigate(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <button className="student-account-button" aria-label={student ? "فتح حساب الطالب" : "تسجيل دخول الطالب"} onClick={() => setAccountOpen(true)}><Icon name="user" size={19}/><span>{student ? student.name.split(" ")[0] : "تسجيل الدخول"}</span>{student && <span className={`sync-dot ${cloudStatus}`} aria-label={cloudStatus === "saved" ? "متزامن" : cloudStatus === "error" ? "تعذرت المزامنة" : "جاري المزامنة"}/>}</button>
            <button
              className="profile-pill"
              onClick={() => setProfileOpen(true)}
            >
              <Icon name="user" size={17} />
              <span>
                {YEARS[Number(profile.year) - 1]} · {dep?.name}
              </span>
            </button>

          </div>
        </div>
      </header>
      <a className="skip-link" href="#main-content">انتقل للمحتوى</a>
      <main id="main-content" tabIndex={-1} className="container page-motion" key={tab}>
        {catalog.settings?.bannerText && (
          <div className="platform-banner">
            <Icon name="news" size={20} />
            <span>{catalog.settings.bannerText}</span>
          </div>
        )}
        {!view && <Notice>{message}</Notice>}
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
                  دراستك،
                  <br />
                  <span>بوضوح أكتر.</span>
                </h1>
                <p>
                  {catalog.settings?.description ||
                    "موادك ومحاضراتك وروابطك المهمة، جاهزة لما تحتاجها. اختار مسارك الدراسي وابدأ من هنا."}
                </p>
                <form className="hero-search" onSubmit={(event) => { event.preventDefault(); const query = q; navigate("library"); setQ(query); }}>
                  <Icon name="search" size={21} /><input aria-label="ابحث عن محاضرة أو ملخص" placeholder="محاضرة، ملخص، أو اسم مادة…" value={q} onChange={(event) => setQ(event.target.value)} /><button type="submit" aria-label="البحث في المكتبة"><Icon name="arrow" size={20} /></button>
                </form>
                <button className="text-button" onClick={() => navigate("library")}>تصفّح المكتبة <Icon name="arrow" size={17} /></button>
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
                    <strong>
                      {
                        catalog.resources.filter((r) => saved.includes(r._id))
                          .length
                      }
                    </strong>
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
            <div className="student-shortcuts" aria-label="اختصارات الدراسة">
              {[["subjects", "book", "موادي", "مرتبة حسب مسارك"], ["saved", "save", "محفوظاتي", "ارجع للمهم بسهولة"], ["sources", "link", "خدمات المعهد", "النتائج والروابط الأصلية"]].map(([id, icon, title, description]) => <button key={id} className="student-shortcut" onClick={() => navigate(id)}><span className="shortcut-icon"><Icon name={icon} /></span><span><strong>{title}</strong><small>{description}</small></span><Icon name="arrow" size={17} /></button>)}
            </div>
            <AdSlot campaigns={catalog.campaigns} slot="home" track={metrics.track} enabled={metrics.enabled}/>
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
              resourceGrid(sortResources(available).slice(0, 6))
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
                  ? student ? "المحتوى اللي اخترت ترجع له. متزامن مع حسابك." : "المحتوى اللي اخترت ترجع له. الحفظ على هذا الجهاز."
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
                onChange={(e) => {
                  setSubject(e.target.value);
                  setLecture("");
                }}
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
            <div className="filter-bar library-options">
              <select
                aria-label="ترتيب المحتوى"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              >
                <option value="newest">الأحدث أولًا</option>
                <option value="lecture">ترتيب المحاضرات</option>
                <option value="title">حسب العنوان</option>
              </select>
              <select
                aria-label="رقم المحاضرة"
                value={lecture}
                onChange={(e) => setLecture(e.target.value)}
              >
                <option value="">كل المحاضرات</option>
                {[
                  ...new Set(
                    (tab === "saved"
                      ? catalog.resources.filter((r) => saved.includes(r._id))
                      : available
                    )
                      .filter((r) => !subject || r.subjectId === subject)
                      .map((r) => r.lecture),
                  ),
                ]
                  .sort((a, b) => a - b)
                  .map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "محتوى عام" : `محاضرة ${n}`}
                    </option>
                  ))}
              </select>
              <select
                aria-label="حالة المذاكرة"
                value={progressFilter}
                onChange={(e) => setProgressFilter(e.target.value)}
              >
                <option value="">كل المحتوى</option>
                <option value="todo">لسه هذاكره</option>
                <option value="done">تمت المذاكرة</option>
              </select>
              {(q || subject || kind || lecture || progressFilter) && (
                <button
                  className="text-button"
                  onClick={() => {
                    setQ("");
                    setSubject("");
                    setKind("");
                    setLecture("");
                    setProgressFilter("");
                  }}
                >
                  مسح الفلاتر
                </button>
              )}
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
                    <div className="study-progress">
                      <progress
                        aria-label={`تقدم مذاكرة ${s.name}`}
                        value={
                          available.filter(
                            (r) =>
                              r.subjectId === s._id &&
                              completed.includes(r._id),
                          ).length
                        }
                        max={Math.max(
                          1,
                          available.filter((r) => r.subjectId === s._id).length,
                        )}
                      />
                      <small>
                        {
                          available.filter(
                            (r) =>
                              r.subjectId === s._id &&
                              completed.includes(r._id),
                          ).length
                        }{" "}
                        من{" "}
                        {available.filter((r) => r.subjectId === s._id).length}{" "}
                        تمت مذاكرته
                      </small>
                    </div>
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
      <footer className="student-footer">
        <div className="container">
          <AdSlot campaigns={catalog.campaigns} slot="footer" track={metrics.track} enabled={metrics.enabled}/>
          <div className="footer-top"><div className="footer-identity"><Brand title={catalog.settings?.title}/><h2>دراستك أوضح. وقتك ليك.</h2><p>مساحة طلابية مستقلة تنظّم المواد والمحاضرات، وتخلّي الرجوع للمهم أسهل.</p></div><nav aria-label="روابط المنصة في الفوتر"><h3>مساحتك الدراسية</h3>{[["library","book","المكتبة"],["saved","save","المحفوظات"],["news","news","الإعلانات"]].map(([id,icon,label])=><button key={id} className="text-button" onClick={()=>navigate(id)}><Icon name={icon} size={17}/>{label}</button>)}<button className="text-button" onClick={()=>setAccountOpen(true)}><Icon name="calendar" size={17}/>حسابي وخطة الدراسة</button></nav><nav aria-label="المصادر الرسمية في الفوتر"><h3>خدمات المعهد</h3>{SOURCES.slice(0,3).map(source=><a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">{source.title}<Icon name="external" size={15}/></a>)}<button className="text-button" onClick={()=>navigate("sources")}>كل المصادر<Icon name="arrow" size={16}/></button>{catalog.settings?.communityUrl&&<a href={catalog.settings.communityUrl} target="_blank" rel="noopener noreferrer">قناة الطلبة<Icon name="external" size={15}/></a>}</nav></div>
          <PrivacyPanel metrics={metrics}/>
          <Suspense fallback={null}><PwaTools/></Suspense>
          <div className="footer-bottom"><p>© {new Date().getFullYear()} EIA Platform · منصة مستقلة، غير تابعة رسميًا للمعهد. حقوق المحتوى لأصحابه.</p><span><Icon name="shield" size={16}/>حسابات الطلبة منفصلة عن الإدارة</span></div>
        </div>
      </footer>
      {accountOpen && <Suspense fallback={<div role="status" className="notice">جاري فتح حسابك…</div>}><StudentAccount user={student} emailVerificationAvailable={emailVerificationAvailable} cloudStatus={cloudStatus} onClose={()=>setAccountOpen(false)} onChanged={applyAccount} onAuthBusy={busy=>{switchingAccount.current=busy;}}/></Suspense>}
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
        <Modal title={view.title} onClose={closeResource}>
          <Notice>{message}</Notice>
          <div className="resource-detail-meta">
            <span className="tag mint">
              {catalog.subjects.find((s) => s._id === view.subjectId)?.name}
            </span>
            <span className="tag">
              {KINDS[view.kind]} ·{" "}
              {view.lecture ? `محاضرة ${view.lecture}` : "محتوى عام"}
            </span>
          </div>
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
                  href={`/api/public/file/${view._id}?download=1`}
                >
                  تنزيل PDF
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
          <div className="resource-actions">
            <button
              className="secondary"
              aria-pressed={completed.includes(view._id)}
              onClick={() => toggleComplete(view._id)}
            >
              <Icon name="check" size={18} />
              {completed.includes(view._id)
                ? "تمت المذاكرة ✓"
                : "علّم كمحتوى تمت مذاكرته"}
            </button>
            <button className="secondary" onClick={() => shareResource(view)}>
              <Icon name="share" size={18} />
              مشاركة
            </button>
            <button
              className="text-button"
              onClick={() => toggleSave(view._id)}
            >
              {saved.includes(view._id)
                ? "إزالة من المحفوظات"
                : "حفظ للرجوع إليه"}
            </button>
          </div>
          {shareUrl && (
            <Field label="رابط مشاركة المحتوى">
              <input
                readOnly
                dir="ltr"
                value={shareUrl}
                onFocus={(e) => e.target.select()}
              />
            </Field>
          )}
          <p className="muted">
            المحفوظات وحالة المذاكرة محفوظة على الجهاز ده.
          </p>
        </Modal>
      )}
    </div>
  );
}
