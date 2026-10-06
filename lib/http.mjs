import { AppError } from "./validation.mjs";
export async function readLimited(request, limit) {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit)
    throw new AppError("الطلب أكبر من الحد المسموح.", 413);
  if (!request.body) throw new AppError("بيانات الطلب مطلوبة.");
  const reader = request.body.getReader();
  const chunks = [];
  let count = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > limit) {
        await reader.cancel();
        throw new AppError("الطلب أكبر من الحد المسموح.", 413);
      }
      chunks.push(value);
    }
  } finally {
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
