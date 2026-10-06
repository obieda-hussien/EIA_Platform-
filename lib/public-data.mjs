export const PUBLIC_FIELDS = {
  campaigns: ["_id", "title", "description", "label", "url", "slot"],
  subjects: [
    "_id",
    "name",
    "code",
    "department",
    "year",
    "term",
    "academicYear",
    "lecturer",
    "group",
    "active",
  ],
  resources: [
    "_id",
    "title",
    "description",
    "subjectId",
    "lecture",
    "kind",
    "status",
    "source",
    "createdAt",
    "updatedAt",
  ],
  news: [
    "_id",
    "title",
    "body",
    "department",
    "year",
    "pinned",
    "sourceUrl",
    "createdAt",
    "expiresAt",
    "status",
  ],
  settings: ["title", "description", "accent", "bannerText", "communityUrl"],
};
const pick = (doc, fields) =>
  Object.fromEntries(
    fields
      .filter((key) => Object.hasOwn(doc || {}, key))
      .map((key) => [key, doc[key]]),
  );
export function publicDocument(type, doc) {
  const result = pick(doc, PUBLIC_FIELDS[type]);
  if (type === "resources") {
    result.links = (doc.links || []).map((link) =>
      pick(link, ["url", "provider", "private"]),
    );
    if (doc.upload) result.upload = pick(doc.upload, ["filename", "bytes"]);
  }
  return result;
}
export function publicProjection(type) {
  return Object.fromEntries(
    [
      ...PUBLIC_FIELDS[type],
      ...(type === "resources"
        ? [
            "links.url",
            "links.provider",
            "links.private",
            "upload.filename",
            "upload.bytes",
          ]
        : []),
    ].map((key) => [key, 1]),
  );
}
