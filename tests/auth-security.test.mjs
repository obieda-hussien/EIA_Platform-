import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ObjectId } from "mongodb";
import { digest, hashPassword } from "../lib/security.mjs";
import { randomBytes } from "node:crypto";
import { totp } from "../lib/mfa.mjs";
let route, calls, documents, passwordHash;
const cookie = "a".repeat(64),
  origin = "https://eia.example";
const outfile = fileURLToPath(
  new URL(`../node_modules/.cache/eia-api-${process.pid}.mjs`, import.meta.url),
);
const equal = (a, b) =>
  a instanceof Date || b instanceof Date
    ? Number(a) === Number(b)
    : String(a) === String(b);
function matches(doc, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "$or") return expected.some((part) => matches(doc, part));
    const actual = doc[key];
    if (
      expected &&
      typeof expected === "object" &&
      !(expected instanceof Date) &&
      !(expected instanceof ObjectId)
    )
      return Object.entries(expected).every(([op, value]) => {
        if (op === "$gt") return actual > value;
        if (op === "$lt") return actual < value;
        if (op === "$ne") return !equal(actual, value);
        if (op === "$exists") return (actual !== undefined) === value;
        if (op === "$in") return value.some((v) => equal(actual, v));
        throw new Error(`Unimplemented test operator ${op}`);
      });
    return Array.isArray(actual)
      ? actual.some((v) => equal(v, expected))
      : equal(actual, expected);
  });
}
function project(doc, projection) {
  if (!doc) return null;
  if (!projection) return structuredClone(doc);
  if (Object.values(projection).some((v) => v === 1))
    return Object.fromEntries(
      Object.entries(doc).filter(([key]) => projection[key] === 1),
    );
  return Object.fromEntries(
    Object.entries(doc).filter(([key]) => projection[key] !== 0),
  );
}
function database() {
  return {
    collection(name) {
      return {
        async findOne(filter, options = {}) {
          calls.push([name, "findOne", filter]);
          return project(
            documents[name]?.find((doc) => matches(doc, filter)),
            options.projection,
          );
        },
        find(filter, options = {}) {
          let list = (documents[name] || [])
            .filter((doc) => matches(doc, filter))
            .map((doc) => project(doc, options.projection));
          const cursor = {
            sort() {
              return cursor;
            },
            limit(n) {
              list = list.slice(0, n);
              return cursor;
            },
            skip(n) {
              list = list.slice(n);
              return cursor;
            },
            project(p) {
              list = list.map((doc) => project(doc, p));
              return cursor;
            },
            async toArray() {
              return list;
            },
          };
          return cursor;
        },
        aggregate() {
          return {
            async toArray() {
              return [];
            },
          };
        },
        async findOneAndUpdate() {
          return { count: 1 };
        },
        async updateOne(filter, update) {
          calls.push([name, "updateOne", filter, update]);
          const doc = documents[name]?.find((item) => matches(item, filter));
          if (!doc) return { matchedCount: 0 };
          Object.assign(doc, update.$set);
          for (const [key, value] of Object.entries(update.$inc || {}))
            doc[key] = (doc[key] || 0) + value;
          for (const key of Object.keys(update.$unset || {})) delete doc[key];
          for (const [key, value] of Object.entries(update.$pull || {}))
            doc[key] = doc[key].filter((v) => !equal(v, value));
          return { matchedCount: 1 };
        },
        async deleteMany(filter) {
          calls.push([name, "deleteMany", filter]);
          documents[name] = documents[name].filter(
            (doc) => !matches(doc, filter),
          );
        },
        async deleteOne(filter) {
          calls.push([name, "deleteOne", filter]);
          documents[name] = documents[name].filter(
            (doc) => !matches(doc, filter),
          );
        },
        async insertOne(doc) {
          calls.push([name, "insertOne"]);
          (documents[name] ||= []).push(doc);
          return { insertedId: doc._id || "test-id" };
        },
      };
    },
  };
}
function reset(role = "owner", options = {}) {
  calls = [];
  globalThis.__eiaCookies = {
    key: options.anonymous ? undefined : cookie,
    get() {
      return this.key ? { value: this.key } : undefined;
    },
    set(name, value) {
      this.key = value;
    },
    delete() {},
  };
  documents = {
    admins: [
      {
        _id: "owner",
        role,
        active: true,
        name: "Owner",
        email: "owner@test.example",
        passwordHash,
        mfaEnabled: false,
        authVersion: 0,
      },
    ],
    sessions: [
      {
        _id: digest(cookie),
        adminId: "owner",
        version: 2,
        authVersion: 0,
        expiresAt: new Date(Date.now() + 3600000),
        lastSeenAt: new Date(),
        createdAt: new Date(),
      },
    ],
    audit: [],
    settings: [],
    subjects: [],
    resources: [],
    news: [],
  };
  globalThis.__eiaDb = database();
}
async function request(path, method = "GET", data, extra = {}) {
  const headers = { host: "eia.example",
    ...(method !== "GET" ? { origin, "content-type": "application/json" } : {}),
    ...extra,
  };
  const result = await route[method](
    new Request(`${origin}/api/${path}`, {
      method,
      headers,
      ...(data ? { body: JSON.stringify(data) } : {}),
    }),
    { params: Promise.resolve({ path: path.split("/") }) },
  );
  return { status: result.status, data: await result.json() };
}
before(async () => {
  process.env.ADMIN_HOST = "eia.example";
  passwordHash = await hashPassword("secure-owner-test-password");
  await mkdir(
    fileURLToPath(new URL("../node_modules/.cache", import.meta.url)),
    { recursive: true },
  );
  await build({
    entryPoints: [
      fileURLToPath(new URL("../app/api/[...path]/route.js", import.meta.url)),
    ],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["mongodb", "web-push", "sharp"],
    plugins: [
      {
        name: "security-test-boundaries",
        setup(builder) {
          builder.onResolve({ filter: /db\.mjs$/ }, () => ({
            path: "db",
            namespace: "test",
          }));
          builder.onResolve({ filter: /^next\/headers$/ }, () => ({
            path: "cookies",
            namespace: "test",
          }));
          builder.onLoad({ filter: /.*/, namespace: "test" }, ({ path }) => ({
            contents:
              path === "db"
                ? "export async function db() { return globalThis.__eiaDb; }"
                : "export async function cookies() { return globalThis.__eiaCookies; }",
          }));
        },
      },
    ],
  });
  route = await import(outfile);
});
after(async () => {
  await unlink(outfile);
  delete globalThis.__eiaDb;
  delete globalThis.__eiaCookies;
});
test("Anonymous admin mutations fail before database access", async () => {
  reset("owner", { anonymous: true });
  assert.equal((await request("admin/news", "POST", {})).status, 401);
  assert.deepEqual(calls, []);
});
test("Editors cannot change subjects, accounts, settings or inspect owner audit records", async () => {
  for (const [path, method] of [
    ["admin/subjects", "POST"],
    ["admin/admins", "POST"],
    ["admin/settings", "PUT"],
  ]) {
    reset("editor");
    assert.equal((await request(path, method, {})).status, 403);
    assert.ok(
      !calls.some(([, action]) => ["insertOne", "updateOne"].includes(action)),
    );
  }
  reset("editor");
  documents.audit.push({ actor: "private" });
  const result = await request("admin/overview");
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.admins, []);
  assert.deepEqual(result.data.audits, []);
});
test("Owner overview allowlists account fields and cannot expose MFA or password secrets", async () => {
  reset();
  Object.assign(documents.admins[0], {
    mfaSecret: "encrypted",
    mfaPending: "pending",
    mfaRecovery: ["hash"],
    futureSecret: "private",
  });
  const result = await request("admin/overview");
  assert.equal(result.status, 200);
  for (const key of [
    "passwordHash",
    "mfaSecret",
    "mfaPending",
    "mfaRecovery",
    "futureSecret",
  ])
    assert.equal(result.data.admins[0][key], undefined);
});
test("Old, idle, changed-password, disabled and unverified MFA sessions fail closed", async () => {
  for (const change of [
    (d) => (d.sessions[0].version = 1),
    (d) => (d.sessions[0].lastSeenAt = new Date(Date.now() - 31 * 60000)),
    (d) => (d.admins[0].authVersion = 1),
    (d) => (d.admins[0].active = false),
    (d) => (d.admins[0].mfaEnabled = true),
  ]) {
    reset();
    change(documents);
    assert.equal((await request("admin/overview")).status, 401);
  }
});
test("Revoking sessions is scoped to the current account, including supplied session IDs", async () => {
  reset();
  const other = {
    ...documents.sessions[0],
    _id: "b".repeat(64),
    adminId: "another-admin",
  };
  documents.sessions.push(other);
  assert.equal(
    (await request(`auth/sessions/${other._id}`, "DELETE")).status,
    200,
  );
  assert.ok(documents.sessions.some((s) => s._id === other._id));
});
test("A stolen session cannot change a password without the current password", async () => {
  reset();
  const result = await request("auth/password", "POST", {
    currentPassword: "wrong",
    newPassword: "new-test-password",
  });
  assert.equal(result.status, 401);
  assert.equal(documents.admins[0].passwordHash, passwordHash);
});
test("Password changes increment auth version, revoke sessions and rotate the current token", async () => {
  reset();
  documents.sessions.push({ ...documents.sessions[0], _id: "c".repeat(64) });
  const result = await request("auth/password", "POST", {
    currentPassword: "secure-owner-test-password",
    newPassword: "new-secure-test-password",
  });
  assert.equal(result.status, 200);
  assert.equal(documents.admins[0].authVersion, 1);
  assert.equal(documents.sessions.length, 1);
  assert.notEqual(documents.sessions[0]._id, digest(cookie));
  assert.equal(documents.sessions[0].authVersion, 1);
});
test("Enrollment requires password reauthentication and confirms only with a fresh TOTP", async () => {
  reset();
  process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
  assert.equal(
    (await request("auth/mfa-enroll", "POST", { currentPassword: "wrong" }))
      .status,
    401,
  );
  const enrollment = await request("auth/mfa-enroll", "POST", {
    currentPassword: "secure-owner-test-password",
  });
  assert.equal(enrollment.status, 200);
  assert.match(enrollment.data.secret, /^[A-Z2-7]{32}$/);
  assert.equal(documents.admins[0].mfaEnabled, false);
  assert.notEqual(documents.admins[0].mfaPending, enrollment.data.secret);
  const code = totp(enrollment.data.secret, Math.floor(Date.now() / 30000));
  const result = await request("auth/mfa-confirm", "POST", { code });
  assert.equal(result.status, 200);
  assert.equal(result.data.recoveryCodes.length, 8);
  assert.equal(documents.admins[0].mfaEnabled, true);
  assert.equal(documents.admins[0].authVersion, 1);
  assert.equal(documents.admins[0].mfaPending, undefined);
  assert.equal(documents.sessions[0].mfaVerified, true);
  const state = await request("auth/security");
  assert.equal(state.data.recoveryRemaining, 8);
  assert.equal(state.data.secret, undefined);
});
test("Expired MFA enrollment cannot be confirmed even with the correct code", async () => {
  reset();
  process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
  const enrollment = await request("auth/mfa-enroll", "POST", {
    currentPassword: "secure-owner-test-password",
  });
  documents.admins[0].mfaPendingExpiresAt = new Date(Date.now() - 1);
  assert.equal(
    (
      await request("auth/mfa-confirm", "POST", {
        code: totp(enrollment.data.secret, Math.floor(Date.now() / 30000)),
      })
    ).status,
    400,
  );
  assert.equal(documents.admins[0].mfaEnabled, false);
});
