import { AppError } from "./validation.mjs";
export function secureMongoOptions(uri) {
  const url = new URL(uri);
  if (!["mongodb:", "mongodb+srv:"].includes(url.protocol))
    throw new AppError("إعداد الاتصال غير صالح.", 503);
  for (const [key, value] of url.searchParams) {
    const name = key.toLowerCase();
    if (
      ([
        "tlsinsecure",
        "tlsallowinvalidcertificates",
        "tlsallowinvalidhostnames",
      ].includes(name) &&
        value.toLowerCase() !== "false") ||
      (["tls", "ssl"].includes(name) && value.toLowerCase() !== "true")
    )
      throw new AppError("إعداد الاتصال غير آمن.", 503);
  }
  return {
    tls: true,
    tlsAllowInvalidCertificates: false,
    tlsAllowInvalidHostnames: false,
    maxPoolSize: 5,
    minPoolSize: 0,
    maxConnecting: 2,
    maxIdleTimeMS: 30000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 10000,
    waitQueueTimeoutMS: 3000,
  };
}
