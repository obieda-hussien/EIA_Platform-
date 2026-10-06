# EIA Platform

An independent, Arabic-first student library for the Egyptian Institute of Alexandria Academy. Next.js App Router + React + MongoDB Atlas, deployed on Vercel. The platform is not an official institute service. No AI integration is included.

## Separate student and control origins

- Students: https://eia-platform-chi.vercel.app
- Team sign-in: https://eia-control-obieda.vercel.app/login

The two origins use one Vercel project and database, with separate page entry points and client components. `ADMIN_HOST` must exactly match the control HTTP Host. The student host (including other deployment aliases) returns 404 for `/admin`, `/login`, `/api/admin/*` and `/api/auth/*`. The control origin does not serve the public catalog. Its root redirects to `/admin`; the server validates an active administrator session before rendering the dashboard and redirects anonymous visitors to `/login`. APIs independently enforce the same host boundary and existing role/session checks. Forwarded-host and surface headers cannot choose the control surface. This is application and browser-origin separation, not separate infrastructure or database isolation.

There is no administration link in student navigation. Knowing the control URL grants no dashboard access. Existing admin accounts and MFA configuration remain valid, but sign in again on the new host: host-prefixed session cookies cannot transfer between origins.

For local development, `ADMIN_HOST=localhost:3000` gives control access at `http://localhost:3000/login`; open `http://127.0.0.1:3000` for the student surface. Set `PUBLIC_SITE_URL` to the student production HTTPS origin. Missing `ADMIN_HOST` closes private routes rather than exposing administration on every host.

The student interface uses a spacious reading layout, home search, study shortcuts and mobile bottom navigation. Control has its own subdued theme, account-aware navigation, a mobile drawer, and a separate sign-in screen. Student branding choices do not change the control theme.

## Included

- Responsive RTL library, course spaces, profile filters (department/year/term), announcements, saved resources on the current device, and original institute service links.
- A resource can have up to four Google Drive/Docs or Telegram message links, an uploaded PDF, or both. Telegram links open the original message; private-channel membership is required for private links. Drive sharing permissions remain controlled by the uploader. No automated Google/Telegram upload, scraping, proxying, or guaranteed direct download is implied.
- PDF uploads up to **2 MiB**, validated by extension and signature, stored as MongoDB Binary inside the resource document. Published PDFs download as attachments with a sandbox policy. Large files use external links. Archived uploads still consume storage; monitor Atlas usage.
- Admin dashboard: overview, course CRUD, file/link CRUD, drafts/publication/archive/restore, targeted announcements with expiry/pinning, owner-controlled admin accounts, branding settings and recent audit activity.
- Platform settings have a live preview, three accent colors, an optional student notice and public Telegram community link. Draft edits can be reset before saving. Opening settings safely excludes object-valued overview data from record filtering.
- Admin lists have Arabic search across course names, titles, attribution and codes, status/course filters, and 20 records per page. Resources and announcements can be copied into a new draft; an existing uploaded PDF must be attached again to the copy. A refresh action reloads the current overview.
- Students can sort by last update, lecture number or title, filter a specific lecture and study status, and manually mark content completed. Course cards show completed-content progress. Study status and favorites stay on the current device.
- Each published resource has a shareable `/?resource=<id>` link. It opens the resource details regardless of the recipient's selected study profile; archive and publication rules still apply. Share uses the device share sheet or clipboard, with a visible URL for manual copying.
- Roles: owner manages accounts/settings; admin also manages courses; editor manages resources/announcements. Authorization is enforced in API handlers, independently of the UI.
- Passwords hashed with salted scrypt; opaque session tokens hashed in MongoDB; HttpOnly/Secure/SameSite cookies; eight-hour sessions with a 30-minute idle timeout; expiry checked on each request; account changes revoke sessions; persistent rate limits; same-origin mutation checks.
- Empty, unavailable database and setup states are explicit. The app does not fabricate documents, results or institute endorsement. Course data is entered by the content team.

## Local development

Requires Node.js 22+ and a MongoDB deployment.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Fill `MONGODB_URI`, use a dedicated `MONGODB_DB` (default `eia_platform`), and configure Atlas network access for your deployment. Do not commit the URI or credentials. The driver reuses a connection promise with a small pool and automatically creates required indexes. The DB user needs access to the dedicated database and permission to create indexes.

## First owner

1. Generate a private setup token: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
2. Set `ADMIN_SETUP_TOKEN` in the server environment. On Vercel add it as an encrypted variable, then redeploy.
3. Visit `/login` on the configured control origin and enter the token, name, email and a password of at least 12 characters.
4. Remove `ADMIN_SETUP_TOKEN` and redeploy after successful setup. A unique, fixed owner ID prevents a second setup even under concurrent requests.
5. Add editors/admins from the dashboard. The owner account cannot be disabled through this UI. Recovery requires a trusted operator with database access; no insecure public password-reset endpoint is provided.

## Vercel

Import this GitHub repository as a **Next.js** project. Build: `npm run build`; install: `npm ci`; Node.js: 24.x. Add `MONGODB_URI`, `MONGODB_DB` and temporarily `ADMIN_SETUP_TOKEN`. Keep previews on a separate database from production to isolate test edits. Reconnecting the Atlas ChatGPT plugin does not itself provide a runtime database URI to Vercel.

This app uses Node.js route handlers for MongoDB. It does not write uploads to Vercel's ephemeral filesystem or send database secrets to the browser. Direct uploads are deliberately kept below the function request body limit. PDFs are downloadable documents and may contain active content; magic-byte validation is not antivirus scanning.

## Content workflow

Create a course for the relevant department, year, term and academic year. Add content as a draft with lecture number, kind, attribution and links/upload. Verify sharing access in a signed-out browser, then publish. Archive from the list to hide content; edit its status to publish again. Archiving a course hides its resources from all public endpoints. Add announcements for all students or a department/year, with an optional expiry.

Keep the same course name in a new academic year as a separate course record. Group and lecturer distinguish offerings. Search covers titles/descriptions/attribution/course names, not PDF text. Favorites and academic choices are stored locally and are not synchronized across devices.

## Verification

```sh
npm run check
npm test
npm run build
npm run test:access
```

UI interaction tests run React in jsdom with isolated API fixtures: owner settings open/preview/validation/save/reopen, admin filtering and pagination, draft duplication, published deep links, sharing and local study-state persistence. These tests do not write to Atlas or verify browser layout.

Tests cover external-link host/path restrictions, private Telegram links, alternative-link limits, PDF size/signature, publication state and academic input, source validation, Arabic search, salted passwords, setup-token comparisons, streamed request limits and origin enforcement. Access tests start a production server with database configuration deliberately disabled and check protected routes, cross-origin rejection and unavailable states. GitHub Actions runs these tests and a production build. Authenticated CRUD and actual Atlas connectivity need a configured test database; they are not covered by the unavailable-state access checks.

## Current boundaries

No official results API integration, AI, automatic exam grading, chat, PDF annotation, PDF text extraction, offline-file synchronization or push notifications are claimed. Public catalog queries are capped (1,000 course records, 2,000 resources, 100 announcements); add server pagination before reaching those limits. Resource-byte counts are capacity figures, not download analytics. Recent audit writes occur after mutations; stronger transactional audit guarantees can be added when required.

## Security hardening

See [SECURITY.md](SECURITY.md) for controls, rate budgets, MFA enrollment, session changes, infrastructure limits and incident recovery. Every admin has an Account Security screen. Add the sensitive production-only MFA_ENCRYPTION_KEY once and preserve it across deployments. Existing administrator sessions must sign in again after this security upgrade. Direct PDFs now download as attachments. Public metadata may be cached for ten seconds; file authorization stays live.
