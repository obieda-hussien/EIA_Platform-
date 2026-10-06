import { normalize } from "./validation.mjs";

// Overview also contains objects (settings/user) and numbers (storageBytes).
// Only content collections may participate in list filtering.
export function adminRecords(
  data,
  tab,
  { query = "", status = "", subject = "" } = {},
) {
  const records =
    ["subjects", "resources", "news", "admins"].includes(tab) &&
    Array.isArray(data?.[tab])
      ? data[tab]
      : [];
  const term = normalize(query.trim());
  const subjects = new Map((data?.subjects || []).map((s) => [s._id, s.name]));
  return records.filter((item) => {
    const state = ["subjects", "admins"].includes(tab)
      ? item.active
        ? "active"
        : "inactive"
      : item.status;
    return (
      (!status || state === status) &&
      (!subject || item.subjectId === subject) &&
      (!term ||
        normalize(
          [
            item.title,
            item.name,
            item.email,
            item.code,
            item.source,
            item.lecturer,
            subjects.get(item.subjectId),
          ]
            .filter(Boolean)
            .join(" "),
        ).includes(term))
    );
  });
}

export function sortResources(records, order = "newest") {
  return [...records].sort((a, b) => {
    if (order === "title") return a.title.localeCompare(b.title, "ar");
    if (order === "lecture")
      return (
        (a.lecture || 0) - (b.lecture || 0) ||
        a.title.localeCompare(b.title, "ar")
      );
    return (
      (Date.parse(b.updatedAt || b.createdAt) || 0) -
      (Date.parse(a.updatedAt || a.createdAt) || 0)
    );
  });
}

export function resourceShareUrl(origin, id) {
  const url = new URL(origin);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  url.searchParams.set("resource", id);
  return url.href;
}
