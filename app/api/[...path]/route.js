import { ObjectId, Binary } from "mongodb";
import { db } from "../../../lib/db.mjs";
import { readLimited } from "../../../lib/http.mjs";
import {
  session,
  startSession,
  endSession,
  owner,
  throttle,
  audit,
} from "../../../lib/session.mjs";
import {
  AppError,
  DEPARTMENTS,
  UPLOAD_LIMIT,
  text,
  email,
  password,
  choice,
  subjectInput,
  resourceInput,
  newsInput,
  settingsInput,
  SITE_DEFAULTS,
  validatePdf,
  normalize,
  escapeRegex,
} from "../../../lib/validation.mjs";
import {
  checkOrigin,
  hashPassword,
  verifyPassword,
  sameSecret,
  digest,
} from "../../../lib/security.mjs";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (data, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
function id(raw) {
  if (!/^[a-f0-9]{24}$/.test(raw || "")) throw new AppError("معرّف غير صحيح.");
  return new ObjectId(raw);
}
async function body(req) {
  const bytes = await readLimited(req, 65536);
  let b;
  try {
    b = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError("بيانات الطلب غير صحيحة.");
  }
  if (!b || typeof b !== "object" || Array.isArray(b))
    throw new AppError("بيانات الطلب غير صحيحة.");
  return b;
}
async function resourceBody(req) {
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data"))
    return { data: resourceInput(await body(req)) };
  const bytes = await readLimited(req, UPLOAD_LIMIT + 65536);
  let form;
  try {
    form = await new Response(bytes, {
      headers: { "content-type": req.headers.get("content-type") },
    }).formData();
  } catch {
    throw new AppError("بيانات الرفع غير صحيحة.");
  }
  let b;
  try {
    b = JSON.parse(form.get("metadata"));
  } catch {
    throw new AppError("بيانات الملف غير صحيحة.");
  }
  const file = form.get("file");
  const data = resourceInput(b);
  if (file && typeof file !== "string" && file.size) {
    const bytes = validatePdf(await file.arrayBuffer(), file.name);
    return {
      data,
      uploaded: {
        data: new Binary(bytes),
        bytes: bytes.length,
        filename: text(file.name, 200),
        sha256: digest(bytes),
      },
    };
  }
  return { data };
}
async function dispatch(req, context) {
  const { path } = await context.params;
  const [area, entity, record] = path;
  const method = req.method;
  const url = new URL(req.url);
  if (method !== "GET") checkOrigin(req);
  if (area === "auth") {
    if (method === "GET" && entity === "session")
      return json({ user: await session(false) });
    if (method === "GET" && entity === "status") {
      const d = await db();
      return json({
        setupRequired: !(await d
          .collection("admins")
          .findOne({ _id: "owner" })),
        setupEnabled: Boolean(process.env.ADMIN_SETUP_TOKEN),
      });
    }
    if (method === "POST" && entity === "logout") {
      await endSession();
      return json({ ok: true });
    }
    if (method === "POST" && entity === "setup") {
      const b = await body(req);
      await throttle("setup", 5);
      if (
        !process.env.ADMIN_SETUP_TOKEN ||
        !sameSecret(b.setupToken, process.env.ADMIN_SETUP_TOKEN)
      )
        throw new AppError("رمز تأسيس المنصة غير صحيح.", 403);
      const d = await db();
      const user = {
        _id: "owner",
        name: text(b.name, 120),
        email: email(b.email),
        passwordHash: await hashPassword(password(b.password)),
        role: "owner",
        active: true,
        createdAt: new Date(),
      };
      try {
        await d.collection("admins").insertOne(user);
      } catch (e) {
        if (e.code === 11000)
          throw new AppError("تم تأسيس حساب المالك بالفعل.", 409);
        throw e;
      }
      await startSession(user);
      await audit(user, "setup", "admins", "owner");
      return json({ ok: true });
    }
    if (method === "POST" && entity === "login") {
      const b = await body(req);
      const address = email(b.email);
      await throttle(`login:${address}`, 8);
      await throttle("login-total", 100);
      const user = await (await db())
        .collection("admins")
        .findOne({ email: address, active: true });
      // Fixed scrypt work also applies when the account does not exist.
      const valid = await verifyPassword(
        b.password,
        user?.passwordHash ||
          "0123456789abcdef0123456789abcdef:" + "00".repeat(64),
      );
      if (!user || !valid)
        throw new AppError("البريد أو كلمة المرور غير صحيحة.", 401);
      await startSession(user);
      await audit(user, "login", "admins", user._id);
      return json({ ok: true });
    }
  }
  if (area === "public" && method === "GET") {
    const d = await db();
    if (entity === "catalog") {
      const [subjects, resources, news, settings] = await Promise.all([
        d
          .collection("subjects")
          .find({ active: true })
          .sort({ year: 1, term: 1, name: 1 })
          .limit(1000)
          .toArray(),
        d
          .collection("resources")
          .find(
            { status: "published" },
            { projection: { "upload.data": 0, searchText: 0 } },
          )
          .sort({ createdAt: -1 })
          .limit(2000)
          .toArray(),
        d
          .collection("news")
          .find({
            status: "published",
            $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
          })
          .sort({ pinned: -1, createdAt: -1 })
          .limit(100)
          .toArray(),
        d.collection("settings").findOne({ _id: "site" }),
      ]);
      const subjectIds = new Set(subjects.map((s) => s._id.toString()));
      return json({
        departments: DEPARTMENTS,
        subjects,
        resources: resources.filter((r) =>
          subjectIds.has(r.subjectId.toString()),
        ),
        news,
        settings: { ...SITE_DEFAULTS, ...settings },
      });
    }
    if (entity === "file") {
      const r = await d
        .collection("resources")
        .findOne({ _id: id(record), status: "published" });
      if (
        !r?.upload ||
        !(await d
          .collection("subjects")
          .findOne({ _id: r.subjectId, active: true }))
      )
        throw new AppError("الملف غير متاح.", 404);
      const download = url.searchParams.get("download") === "1";
      return new Response(new Uint8Array(r.upload.data.buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(r.upload.bytes),
          "Content-Disposition": `${download ? "attachment" : "inline"}; filename="material.pdf"; filename*=UTF-8''${encodeURIComponent(r.upload.filename)}`,
          "Cache-Control": "private, no-store",
          "Content-Security-Policy": "sandbox; default-src 'none'",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }
  if (area === "admin") {
    const user = await session();
    const d = await db();
    if (entity === "overview" && method === "GET") {
      const [subjects, resources, news, admins, audits, storage] =
        await Promise.all([
          d
            .collection("subjects")
            .find({})
            .sort({ createdAt: -1 })
            .limit(1000)
            .toArray(),
          d
            .collection("resources")
            .find({}, { projection: { "upload.data": 0, searchText: 0 } })
            .sort({ createdAt: -1 })
            .limit(2000)
            .toArray(),
          d
            .collection("news")
            .find({})
            .sort({ createdAt: -1 })
            .limit(500)
            .toArray(),
          user.role === "owner"
            ? d
                .collection("admins")
                .find({}, { projection: { passwordHash: 0 } })
                .toArray()
            : [],
          d
            .collection("audit")
            .find({})
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray(),
          d
            .collection("resources")
            .aggregate([
              { $group: { _id: null, bytes: { $sum: "$upload.bytes" } } },
            ])
            .toArray(),
        ]);
      return json({
        user,
        departments: DEPARTMENTS,
        subjects,
        resources,
        news,
        admins,
        audits,
        storageBytes: storage[0]?.bytes || 0,
        settings: {
          ...SITE_DEFAULTS,
          ...(await d.collection("settings").findOne({ _id: "site" })),
        },
      });
    }
    if (entity === "admins") {
      owner(user);
      if (method === "POST") {
        const b = await body(req);
        const item = {
          name: text(b.name, 120),
          email: email(b.email),
          role: choice(b.role, ["admin", "editor"]),
          passwordHash: await hashPassword(password(b.password)),
          active: true,
          createdAt: new Date(),
        };
        let result;
        try {
          result = await d.collection("admins").insertOne(item);
        } catch (e) {
          if (e.code === 11000) throw new AppError("البريد مسجل بالفعل.", 409);
          throw e;
        }
        await audit(user, "create", "admins", result.insertedId);
        return json({ ok: true }, 201);
      }
      if (method === "PUT") {
        if (record === "owner")
          throw new AppError("حساب المالك لا يمكن تعطيله من هذه الشاشة.", 403);
        const b = await body(req);
        const changes = {
          name: text(b.name, 120),
          role: choice(b.role, ["admin", "editor"]),
          active: Boolean(b.active),
        };
        if (b.password)
          changes.passwordHash = await hashPassword(password(b.password));
        const result = await d
          .collection("admins")
          .updateOne({ _id: id(record) }, { $set: changes });
        if (!result.matchedCount) throw new AppError("الحساب غير موجود.", 404);
        await d.collection("sessions").deleteMany({ adminId: id(record) });
        await audit(user, "update", "admins", record);
        return json({ ok: true });
      }
    }
    if (entity === "settings" && method === "PUT") {
      owner(user);
      const b = await body(req);
      await d.collection("settings").updateOne(
        { _id: "site" },
        {
          $set: {
            ...settingsInput(b),
            updatedAt: new Date(),
          },
        },
        { upsert: true },
      );
      await audit(user, "update", "settings", "site");
      return json({ ok: true });
    }
    if (
      ["subjects", "resources", "news"].includes(entity) &&
      ["POST", "PUT"].includes(method)
    ) {
      if (user.role === "editor" && entity === "subjects")
        throw new AppError("إدارة المواد متاحة للأدمن والمالك.", 403);
      let data, uploaded;
      if (entity === "resources") {
        ({ data, uploaded } = await resourceBody(req));
        data.subjectId = id(data.subjectId);
        if (
          !(await d
            .collection("subjects")
            .findOne({ _id: data.subjectId, active: true }))
        )
          throw new AppError("اختار مادة متاحة.");
      } else
        data =
          entity === "subjects"
            ? subjectInput(await body(req))
            : newsInput(await body(req));
      const existing =
        method === "PUT"
          ? await d.collection(entity).findOne({ _id: id(record) })
          : null;
      if (method === "PUT" && !existing)
        throw new AppError("السجل غير موجود.", 404);
      if (entity === "resources") {
        if (uploaded) data.upload = uploaded;
        if (!uploaded && !existing?.upload && !data.links.length)
          throw new AppError("أضف رابطًا أو ملف PDF.");
        data.searchText = normalize(
          `${data.title} ${data.description} ${data.source}`,
        );
      }
      data.updatedAt = new Date();
      data.updatedBy = user.email;
      let itemId;
      if (method === "POST") {
        data.createdAt = new Date();
        itemId = (await d.collection(entity).insertOne(data)).insertedId;
      } else {
        itemId = id(record);
        await d.collection(entity).updateOne({ _id: itemId }, { $set: data });
      }
      await audit(
        user,
        method === "POST" ? "create" : "update",
        entity,
        itemId,
      );
      return json({ ok: true, id: itemId }, method === "POST" ? 201 : 200);
    }
    if (
      ["resources", "news", "subjects"].includes(entity) &&
      method === "DELETE"
    ) {
      if (user.role === "editor" && entity === "subjects")
        throw new AppError("إدارة المواد متاحة للأدمن والمالك.", 403);
      const result = await d.collection(entity).updateOne(
        { _id: id(record) },
        {
          $set:
            entity === "subjects"
              ? { active: false, updatedAt: new Date() }
              : { status: "archived", updatedAt: new Date() },
        },
      );
      if (!result.matchedCount) throw new AppError("السجل غير موجود.", 404);
      await audit(user, "archive", entity, record);
      return json({ ok: true });
    }
  }
  throw new AppError("المسار غير موجود.", 404);
}
async function handle(req, context) {
  try {
    return await dispatch(req, context);
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    return json({ error: "تعذر إتمام العملية. حاول مجددًا." }, 500);
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
