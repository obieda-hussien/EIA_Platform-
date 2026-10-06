import "server-only";
import { MongoClient } from "mongodb";
import { AppError } from "./validation.mjs";
let connecting;
export async function db() {
  if (!process.env.MONGODB_URI)
    throw new AppError(
      "قاعدة البيانات لم تُربط بعد. أضف MONGODB_URI في إعدادات Vercel.",
      503,
    );
  if (!connecting) {
    const client = new MongoClient(process.env.MONGODB_URI, {
      maxPoolSize: 5,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 8000,
    });
    connecting = client
      .connect()
      .then(async (c) => {
        const d = c.db(process.env.MONGODB_DB || "eia_platform");
        await Promise.all([
          d.collection("admins").createIndex({ email: 1 }, { unique: true }),
          d
            .collection("sessions")
            .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          d
            .collection("attempts")
            .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
          d
            .collection("resources")
            .createIndex({ subjectId: 1, status: 1, createdAt: -1 }),
          d
            .collection("subjects")
            .createIndex({ department: 1, year: 1, term: 1, active: 1 }),
          d
            .collection("news")
            .createIndex({ status: 1, pinned: -1, createdAt: -1 }),
        ]);
        return d;
      })
      .catch(() => {
        connecting = undefined;
        throw new AppError(
          "تعذر الاتصال بقاعدة البيانات. راجع إعدادات Atlas وVercel.",
          503,
        );
      });
  }
  return connecting;
}
