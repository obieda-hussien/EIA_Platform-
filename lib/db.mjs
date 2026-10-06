import "server-only";
import { MongoClient } from "mongodb";
import { AppError } from "./validation.mjs";
import { secureMongoOptions } from "./mongo-options.mjs";
let connecting;
export async function db() {
  if (!process.env.MONGODB_URI)
    throw new AppError("الخدمة غير متاحة مؤقتًا. حاول بعد قليل.", 503);
  if (!connecting) {
    const client = new MongoClient(
      process.env.MONGODB_URI,
      secureMongoOptions(process.env.MONGODB_URI),
    );
    connecting = client
      .connect()
      .then(async (c) => {
        const d = c.db(process.env.MONGODB_DB || "eia_platform");
        await Promise.all([
          d.collection("push_subscriptions").createIndex({endpointHash:1},{unique:true}),
          d.collection("push_subscriptions").createIndex({expiresAt:1},{expireAfterSeconds:0}),
          d.collection("push_deliveries").createIndex({expiresAt:1},{expireAfterSeconds:0}),
          d.collection("admins").createIndex({ email: 1 }, { unique: true }),
          d.collection("students").createIndex({ email: 1 }, { unique: true }),
          d.collection("student_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          d.collection("student_sessions").createIndex({ studentId: 1, createdAt: -1 }),
          d.collection("student_device_links").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          d.collection("student_device_links").createIndex({ deviceId: 1, lastSeenAt: -1 }),
          d.collection("activity_sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          d.collection("activity_sessions").createIndex({ consent: 1, visible: 1, lastPulseAt: -1 }),
          d.collection("activity_daily").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          d.collection("activity_daily").createIndex({ day: 1 }),
          d.collection("activity_events").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          d.collection("activity_events").createIndex({ day: 1, type: 1, target: 1 }),
          d.collection("campaigns").createIndex({ status: 1, startsAt: 1, endsAt: 1 }),
          d
            .collection("sessions")
            .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          d
            .collection("attempts")
            .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          d
            .collection("resources")
            .createIndex({ subjectId: 1, status: 1, createdAt: -1 }),
          d.collection("resources").createIndex({ status: 1, createdAt: -1 }),
          d
            .collection("subjects")
            .createIndex({ department: 1, year: 1, term: 1, active: 1 }),
          d
            .collection("news")
            .createIndex({ status: 1, pinned: -1, createdAt: -1 }),
          d.collection("sessions").createIndex({ adminId: 1, createdAt: -1 }),
          d
            .collection("audit")
            .createIndex({ createdAt: 1 }, { expireAfterSeconds: 90 * 86400 }),
        ]);
        return d;
      })
      .catch(() => {
        connecting = undefined;
        void client.close().catch(() => {});
        throw new AppError("الخدمة غير متاحة مؤقتًا. حاول بعد قليل.", 503);
      });
  }
  return connecting;
}
