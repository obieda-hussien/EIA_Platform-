import { AppError, email, text, choice, integer, DEPARTMENTS } from './validation.mjs';
export function institutionalEmail(value) {
  const address = email(value);
  if (!/^[a-z0-9][a-z0-9._+-]{0,63}@eia\.edu\.eg$/.test(address)) throw new AppError('استخدم بريد المعهد المنتهي بـ @eia.edu.eg.');
  return address;
}
export function studyState(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('بيانات الدراسة غير صحيحة.');
  const p = value.profile || {};
  const ids = list => {
    if (!Array.isArray(list) || list.length > 2000 || list.some(id => typeof id !== 'string' || !/^[a-f0-9]{24}$/.test(id))) throw new AppError('قائمة المحتوى غير صحيحة.');
    return [...new Set(list)];
  };
  const saved = ids(value.saved || []), completed = ids(value.completed || []);
  if (saved.length + completed.length > 2000) throw new AppError('المحفوظات والتقدم بحد أقصى ٢٠٠٠ عنصر معًا.');
  return {
    profile: { department: choice(p.department, DEPARTMENTS.map(d => d.id)), year: String(integer(p.year, 1, 4)), term: String(integer(p.term, 1, 2)), academicYear: /^20\d{2}\/20\d{2}$/.test(p.academicYear || '') ? p.academicYear : '2026/2027', group: text(p.group || '', 40, false) },
    saved, completed,
  };
}
export function plannerItems(items) {
  if (!Array.isArray(items) || items.length > 60) throw new AppError('الخطة بحد أقصى ٦٠ مهمة.');
  const seen = new Set();
  return items.map(item => {
    const id = text(item.id, 40);
    if (!/^[a-zA-Z0-9-]{8,40}$/.test(id) || seen.has(id)) throw new AppError('معرّف المهمة غير صحيح.');
    seen.add(id);
    const date = text(item.date || '', 10, false);
    if (date && (!/^20\d{2}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date)) throw new AppError('تاريخ المهمة غير صحيح.');
    return { id, title: text(item.title, 150), date, done: item.done === true };
  });
}
export function studentDocument(user) {
  return { _id: String(user._id), name: user.name, email: user.email, emailVerified: user.emailVerified === true, role: 'student', personal: {phone:user.personal?.phone||'',studentCode:user.personal?.studentCode||'',city:user.personal?.city||'',bio:user.personal?.bio||''}, profileVersion:user.profileVersion||0, analyticsConsent:typeof user.analyticsConsent==='boolean'?user.analyticsConsent:null };
}

export function personalProfile(b) {
 if(!b||typeof b!=='object'||Array.isArray(b))throw new AppError('بيانات البروفايل غير صحيحة.');
 const phone=text(b.phone||'',20,false).replace(/[ ()-]/g,'');
 if(phone&&!/^\+?[0-9]{7,15}$/.test(phone))throw new AppError('رقم الهاتف يحتاج من ٧ إلى ١٥ رقمًا.');
 const studentCode=text(b.studentCode||'',24,false);
 if(studentCode&&!/^[a-zA-Z0-9_-]{3,24}$/.test(studentCode))throw new AppError('كود الطالب يحتاج حروفًا أو أرقامًا من ٣ إلى ٢٤ خانة.');
 return {name:text(b.name,100),phone,studentCode,city:text(b.city||'',80,false),bio:text(b.bio||'',300,false)};
}
