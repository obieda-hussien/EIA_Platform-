import { AppError } from './validation.mjs';
const cairo = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year:'numeric',month:'2-digit',day:'2-digit' });
export const cairoDay = date => cairo.format(new Date(date));
export function activityDelta(previous, pulse, now = Date.now()) {
  if (typeof pulse?.visible !== 'boolean' || typeof pulse?.active !== 'boolean') throw new AppError('بيانات النشاط غير صحيحة.');
  const elapsed = now - Number(previous?.lastPulseAt);
  // Gaps are capped, background/idle time never accumulates without a heartbeat.
  const foregroundMs = previous?.visible && elapsed >= 0 && elapsed <= 45000 ? Math.min(elapsed, 20000) : 0;
  return { foregroundMs, activeMs: previous?.active ? foregroundMs : 0, visible: pulse.visible, active: pulse.visible && pulse.active };
}
export function splitDays(start, end, foregroundMs, activeMs) {
  const last = cairoDay(end), first = cairoDay(start);
  if (!foregroundMs || first === last) return [{ day: last, foregroundMs, activeMs }];
  let low = start, high = end;
  while (high-low>1) { const mid = Math.floor((low+high)/2); if(cairoDay(mid)===first) low=mid; else high=mid; }
  const before = Math.min(foregroundMs, Math.max(0, high-start));
  const beforeActive = Math.min(activeMs, before);
  return [{ day: first, foregroundMs: before, activeMs: beforeActive }, { day: last, foregroundMs: foregroundMs-before, activeMs: activeMs-beforeActive }];
}
export function safeEvent(b) {
  if (b?.type === 'view' && ['home','subjects','library','news','saved','sources'].includes(b.target)) return { type: b.type, target: b.target };
  if (['ad_impression','ad_click','resource_open'].includes(b?.type) && /^[a-f0-9]{24}$/.test(b.target || '')) return { type: b.type, target: b.target };
  throw new AppError('حدث غير صحيح.');
}
