import test from "node:test";
import assert from "node:assert/strict";
import { scryptSync, randomBytes } from "node:crypto";
import {
  clientKey,
  createLimiter,
  validateRoute,
  createSnapshotCache,
} from "../lib/guard.mjs";
import { publicDocument, publicProjection } from "../lib/public-data.mjs";
import { pageCsp } from "../lib/csp.mjs";
import { secureMongoOptions } from "../lib/mongo-options.mjs";
import {
  verifyPassword,
  hashPassword,
  digest,
  checkOrigin,
} from "../lib/security.mjs";
import { readLimited } from "../lib/http.mjs";
import {
  base32,
  totp,
  matchingCounter,
  encryptMfa,
  decryptMfa,
  newRecoveryCodes,
  verifyMfa,
} from "../lib/mfa.mjs";
test("Public documents drop identities, hashes, binary and future secrets", () => {
  const doc = {
    _id: "id",
    title: "PDF",
    updatedBy: "private@example.com",
    passwordHash: "secret",
    mfaSecret: "secret",
    upload: { data: "binary", sha256: "hash", bytes: 123, filename: "x.pdf" },
    links: [
      {
        url: "https://t.me/channel/1",
        provider: "telegram",
        private: false,
        secret: true,
      },
    ],
  };
  const data = publicDocument("resources", doc);
  assert.deepEqual(data.upload, { filename: "x.pdf", bytes: 123 });
  assert.equal(data.links[0].secret, undefined);
  for (const name of ["updatedBy", "passwordHash", "mfaSecret"])
    assert.equal(data[name], undefined);
  assert.equal(publicProjection("resources")["upload.data"], undefined);
  assert.equal(
    publicDocument("settings", { title: "site", apiKey: "secret" }).apiKey,
    undefined,
  );
});
test("IP budgets trust only Vercel runtime header, ignore spoofed XFF elsewhere", () => {
  const request = new Request("https://example.com", {
    headers: {
      "x-forwarded-for": "attacker",
      "x-vercel-forwarded-for": "203.0.113.1",
    },
  });
  assert.equal(clientKey(request, true), digest("203.0.113.1"));
  assert.notEqual(clientKey(request, false), digest("203.0.113.1"));
  assert.equal(
    clientKey(
      new Request("https://example.com", {
        headers: { "x-vercel-forwarded-for": "evil, 1.2.3.4" },
      }),
      true,
    ),
    clientKey(request, false),
  );
});
test("Limiter isolates clients, expires budgets and bounds key growth", () => {
  let now = 0;
  const limit = createLimiter(2, () => now);
  limit("a", 1, 1000);
  limit("b", 1, 1000);
  assert.throws(
    () => limit("a", 1, 1000),
    (e) => e.status === 429 && e.retryAfter === 1,
  );
  assert.throws(
    () => limit("c", 1, 1000),
    (e) => e.status === 429,
  );
  now = 1001;
  assert.doesNotThrow(() => limit("c", 1, 1000));
});
test("Routes reject path pollution, operator-shaped IDs and cache-busting queries", () => {
  const url = new URL("https://example.com/api/public/catalog");
  for (const path of [
    ["public", "catalog", "extra"],
    ["auth", "session", "extra"],
    ["admin", "$where"],
    ["public", "file", "{$ne:null}"],
    ["admin", "news", "a".repeat(24), "extra"],
  ])
    assert.throws(() => validateRoute(path, "GET", url));
  assert.throws(() =>
    validateRoute(["public", "catalog"], "GET", new URL(`${url}?x=random`)),
  );
  assert.throws(
    () => validateRoute(["auth", "login"], "GET", url),
    (e) => e.status === 405,
  );
  assert.doesNotThrow(() =>
    validateRoute(
      ["public", "file", "a".repeat(24)],
      "GET",
      new URL(`${url}?download=1`),
    ),
  );
});
test("Concurrent catalog reads coalesce; failed snapshots are never cached", async () => {
  let now = 0,
    calls = 0;
  const cache = createSnapshotCache(10, () => now);
  const loader = async () => {
    calls++;
    return { ok: true };
  };
  await Promise.all(Array.from({ length: 50 }, () => cache.get(loader)));
  assert.equal(calls, 1);
  await cache.get(loader);
  assert.equal(calls, 1);
  now = 11;
  await cache.get(loader);
  assert.equal(calls, 2);
  cache.clear();
  await assert.rejects(
    cache.get(async () => {
      throw new Error("failure");
    }),
  );
  await cache.get(loader);
  assert.equal(calls, 3);
});
test("Invalidated in-flight loads cannot re-cache obsolete content", async () => {
  const cache = createSnapshotCache();
  let finish;
  const old = cache.get(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await Promise.resolve();
  cache.clear();
  finish({ old: true });
  await old;
  assert.deepEqual(await cache.get(async () => ({ new: true })), { new: true });
});
test("Production CSP forbids inline scripts, eval and framing", () => {
  const policy = pageCsp("fresh");
  assert.match(policy, /nonce-fresh/);
  assert.match(policy, /strict-dynamic/);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/);
  assert.match(policy, /frame-ancestors 'none'/);
});
test("MongoDB rejects certificate bypass and plaintext TLS options", () => {
  const root = "mongodb+srv://user:pass@cluster.example/db";
  for (const query of [
    "tls=false",
    "ssl=false",
    "tlsInsecure=true",
    "tlsAllowInvalidCertificates=true",
    "tlsAllowInvalidHostnames=true",
    "TLS=false",
  ])
    assert.throws(() => secureMongoOptions(`${root}?${query}`));
  const options = secureMongoOptions(root);
  assert.equal(options.tls, true);
  assert.equal(options.maxPoolSize, 5);
});
test("Password verifier supports legacy hashes and rejects unbounded work factors", async () => {
  const value = "a-long-test-password",
    salt = randomBytes(16).toString("hex");
  assert.equal(
    await verifyPassword(
      value,
      `${salt}:${scryptSync(value, salt, 64).toString("hex")}`,
    ),
    true,
  );
  assert.equal(await verifyPassword(value, "scrypt$999999999$bad$bad"), false);
  assert.match(await hashPassword(value), /^scrypt\$65536\$/);
});
test("Fetch Metadata rejects cross-site writes despite matching Origin", () => {
  assert.throws(
    () =>
      checkOrigin(
        new Request("https://eia.example/api/auth/login", {
          headers: {
            origin: "https://eia.example",
            "sec-fetch-site": "cross-site",
          },
        }),
      ),
    (e) => e.status === 403,
  );
});
test("Slow and compressed bodies fail without indefinite reads", async () => {
  const body = new ReadableStream({ start() {} });
  await assert.rejects(
    readLimited(
      new Request("https://example.com", {
        method: "POST",
        body,
        duplex: "half",
      }),
      100,
      10,
    ),
    (e) => e.status === 408,
  );
  await assert.rejects(
    readLimited(
      new Request("https://example.com", {
        method: "POST",
        body: "x",
        headers: { "content-encoding": "gzip" },
      }),
      100,
    ),
    (e) => e.status === 415,
  );
});
const secret = base32(Buffer.from("12345678901234567890"));
test("TOTP matches RFC 6238 vectors and rejects replay and stale codes", () => {
  for (const [time, code] of [
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ])
    assert.equal(totp(secret, Math.floor(time / 30)), code);
  assert.equal(matchingCounter(secret, "287082", -1, 59000), 1);
  assert.equal(matchingCounter(secret, "287082", 1, 59000), null);
  assert.equal(matchingCounter(secret, "287082", -1, 200000), null);
  assert.equal(matchingCounter(secret, { $ne: null }), null);
});
test("MFA encryption detects tampering; recovery codes are random and hashed", () => {
  process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
  const a = encryptMfa(secret),
    b = encryptMfa(secret);
  assert.notEqual(a, b);
  assert.equal(decryptMfa(a), secret);
  const parts = a.split(".");
  parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
  assert.throws(() => decryptMfa(parts.join(".")));
  const recovery = newRecoveryCodes();
  assert.equal(new Set(recovery.codes).size, 8);
  assert.deepEqual(recovery.hashes, recovery.codes.map(digest));
});
test("Concurrent TOTP and repeated recovery codes succeed only once", async () => {
  process.env.MFA_ENCRYPTION_KEY = randomBytes(32).toString("base64url");
  const user = {
    _id: "owner",
    mfaEnabled: true,
    mfaSecret: encryptMfa(secret),
    mfaLastCounter: -1,
  };
  let usedCounter = -1,
    usedRecovery = false;
  const collection = {
    async updateOne(filter, change) {
      if (change.$set) {
        const counter = change.$set.mfaLastCounter;
        if (usedCounter >= counter) return { matchedCount: 0 };
        usedCounter = counter;
        return { matchedCount: 1 };
      }
      assert.equal(filter.mfaRecovery, digest("a".repeat(20)));
      if (usedRecovery) return { matchedCount: 0 };
      usedRecovery = true;
      return { matchedCount: 1 };
    },
  };
  assert.deepEqual(
    await Promise.all([
      verifyMfa(collection, user, "287082", 59000),
      verifyMfa(collection, user, "287082", 59000),
    ]),
    [true, false],
  );
  assert.equal(await verifyMfa(collection, user, "a".repeat(20), 59000), true);
  assert.equal(await verifyMfa(collection, user, "a".repeat(20), 59000), false);
});
