import { AppError } from "./validation.mjs";
export async function readLimited(request, limit, timeoutMs = 10000) {
  const declared = request.headers.get("content-length");
  if (declared && !/^\d+$/.test(declared))
    throw new AppError("حجم الطلب غير صحيح.");
  const length = Number(declared);
  if (length > limit) throw new AppError("الطلب أكبر من الحد المسموح.", 413);
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding !== "identity")
    throw new AppError("ترميز الطلب غير متاح.", 415);
  if (!request.body) throw new AppError("بيانات الطلب مطلوبة.");
  const reader = request.body.getReader();
  const chunks = [];
  let count = 0;
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new AppError("انتهت مهلة إرسال الطلب.", 408));
      // Do not wait for an untrusted stream's cancel callback.
      void reader.cancel().catch(() => {});
    }, timeoutMs);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      count += value.byteLength;
      if (count > limit) {
        void reader.cancel().catch(() => {});
        throw new AppError("الطلب أكبر من الحد المسموح.", 413);
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(count);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
