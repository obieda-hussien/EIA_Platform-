// Host is the platform's request authority. Never trust client-provided
// x-forwarded-host / surface headers for access to the control surface.
export function isControlHost(host, adminHost = process.env.ADMIN_HOST) {
  if (!host || !adminHost) return false;
  return host.toLowerCase() === adminHost.toLowerCase();
}
export function surfaceAllows(host, pathname, adminHost = process.env.ADMIN_HOST) {
  const control = isControlHost(host, adminHost);
  const privatePath = /^\/(?:admin|login)(?:\/|$)|^\/api\/(?:admin|auth)(?:\/|$)/.test(pathname);
  if (privatePath) return control;
  if (control && pathname.startsWith('/api/')) return false;
  if (control && pathname !== '/' && !pathname.startsWith('/_next/') && pathname !== '/favicon.ico' && pathname !== '/robots.txt' && !pathname.startsWith('/icons/')) return false;
  return true;
}
