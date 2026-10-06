# Security controls and operating limits

This hardening reduces identified risks; it is not a claim that every vulnerability or distributed attack is eliminated. Public educational content is intentionally public. Administrator actions require active, authorized server-side sessions. No production stress test or exploit scan against other services is performed.

## Application controls

- Public course/resource/news/settings data use positive field allowlists both in MongoDB projections and serialization. Administrator email attribution, audit data, binary data, hashes and MFA material never belong in the public catalog. Owner account listings also use positive projections; audit records are owner-only.
- Write requests require a same-site Origin and reject cross-site Fetch Metadata. JSON is explicitly typed and bounded to 64 KiB. Multipart data is bounded to 2 MiB plus 64 KiB. Unsupported encodings, malformed paths, IDs, extra path segments and query parameters are rejected. Stream deadlines are 10 seconds (JSON) and 30 seconds (uploads).
- Passwords use salted scrypt N=65536, r=8, p=2. Existing N=16384 hashes remain readable and are upgraded after successful login. At most four password derivations run concurrently per worker; overload fails quickly. Unknown accounts incur scrypt work and receive the same login error.
- Production sessions use a Secure, HttpOnly, SameSite=Strict, host-only `__Host-eia_session` cookie. Only SHA-256 digests of random 256-bit tokens are stored. Sessions expire after 30 minutes idle or eight hours absolute. Invalid/legacy tokens, disabled accounts, unknown roles, unverified MFA sessions and stale authentication versions fail closed. Password, role and MFA changes revoke old access even if another login raced the change. A security upgrade requires existing admins to sign in again.
- Every admin has an **Account Security** screen: password reauthentication, password rotation, own session listing/revocation and optional TOTP two-factor authentication. Enable MFA for every administrator. Confirmation requires a current six-digit code; pending enrollment lasts ten minutes. Secrets are encrypted with AES-256-GCM using a production-only sensitive environment key. Codes have a 30-second step, one-step clock tolerance, atomic replay prevention, and eight hashed single-use recovery codes. Recovery codes appear once. Password changes and disabling MFA require the current password and a code/recovery code when enabled.
- Each page receives a fresh CSP nonce through Next.js Proxy and is dynamically rendered. Script/style CSP does not allow unsafe-inline; production scripts disallow eval and require a nonce. Framing and objects are denied. HSTS, nosniff, referrer policy, COOP/CORP and restricted permissions are configured. Authentication, API responses and PDFs are not CDN-cached.
- PDFs always download as attachments with a sandbox CSP. Size/extension/magic-byte checks are not antivirus scanning or PDF content sanitization. Use trusted content editors and inspect documents before publishing. Drive/Telegram URLs are validated and never fetched server-side; external providers control their files and permissions.

## Rate budgets and availability

| Budget | Scope | Limit |
| --- | --- | --- |
| All API requests | Worker + client | 240/minute |
| Authentication mutations | Worker + client | 30/minute |
| Admin requests | Worker + account | 120/minute |
| Password derivations | Worker | 4 concurrent |
| Login | MongoDB + client | 30/10 minutes |
| Login | MongoDB + client/account pair | 8/10 minutes |
| Account security changes | MongoDB + account | 8/10 minutes |
| Administrative writes | MongoDB + account | 60/minute |
| PDF requests | Worker and MongoDB + client | 30/minute |

`Retry-After` accompanies throttled requests. Client identities use only Vercel's overwritten `x-vercel-forwarded-for` header in a Vercel runtime; raw client-controlled XFF is ignored on other hosts. Self-hosted deployments must configure a trusted IP extraction policy. Missing trusted identity shares a fallback budget. Local limiter maps are bounded to 4,096 keys and fail closed at capacity; they are **not** distributed DDoS protection. MongoDB counters use atomic updates, hashed identities, fixed windows and TTL expiry. There is no site-wide login quota that one attacker can exhaust for all administrators. Distributed attacks, IP rotation and shared campus NAT need edge controls and real-traffic tuning.

Public catalog loads coalesce into one in-flight query per worker and cache a sanitized snapshot for ten seconds. Edits invalidate the current worker immediately; other workers may show metadata for up to ten seconds. Download authorization always checks live published status and active course status. Errors and private data are never cached. Expired announcements may remain visible during that short metadata cache window.

MongoDB uses verified TLS, a pool of five connections, bounded connection/socket/wait-queue deadlines and query deadlines on public scans. Publication queries have supporting indexes. Audit retention is 90 days; session and throttle cleanup uses TTL indexes. Runtime database credentials have readWrite on `eia_platform` only, with no Atlas-management or other-database permissions.

## Deployment and infrastructure

The production owner already exists. `ADMIN_SETUP_TOKEN` is cleared in Vercel so bootstrap is closed on new deployments. MFA_ENCRYPTION_KEY is a sensitive production-only value. Never regenerate it during a deployment: existing TOTP secrets need the same key. Back up the key using the operator's secure secret manager; do not commit it or put it in chat. Preview environments must use isolated data and keys.

Vercel's automatic platform DDoS mitigations remain enabled. Custom WAF changes are staged, not activated by this change. Review the actual draft before publishing. Current plan rejected adding additional edge rate limits; the compatible draft uses log-only observation for POST login, PDF GET traffic and common irrelevant exploit paths. Log rules detect traffic and do **not** block it. Publish the observation phase, review real traffic, then separately stage and review enforcement. Avoid broad user-agent, country or browser-fingerprint blocks.

The shared Atlas project still has `0.0.0.0/0` network access for serverless connectivity. TLS and scoped credentials do not replace network isolation. Do not remove the shared allowlist until both EIA and FulfillOS have confirmed stable outbound addresses, or isolate EIA into its own project and supported network configuration. A paid/static-egress migration and Atlas backup subscription were not purchased. Configure an appropriate supported backup plan and test restoring EIA data before relying on disaster recovery.

Dependencies are checked with npm audit in CI; weekly Dependabot configuration covers npm and GitHub Actions. Organization/repository settings control whether dependency alerts and branch rules are enabled. No external security audit or universal vulnerability-free guarantee is claimed.

## Operator checklist and incident response

1. Sign in at `/admin`, open Account Security, enable MFA, save the recovery codes offline, then use a separate session to verify login with a code. Keep the first session open until verification succeeds. Repeat for every administrator.
2. Review Vercel Firewall's draft and publish the log-only observation rules. Review intended matches before switching them to blocking/challenge or purchasing edge rate limiting. Keep automatic DDoS protection enabled. During an actual attack, an operator can enable temporary Attack Mode in Vercel after considering its user-visible challenge.
3. Require MFA on GitHub, Vercel and Atlas operator accounts; use separate least-privileged service accounts. Rotate credentials previously pasted into chat through the owning service and update every dependent deployment before revoking them. The earlier FulfillOS credential also serves another project and was not changed blindly.
4. During suspected admin compromise, disable that admin or revoke sessions. Change the password, check owner audit records, verify publication/settings changes, and restore trusted content as needed. Authentication version checks block concurrent stale-session creation.
5. For database compromise, rotate the EIA database user, update the sensitive Vercel environment value, redeploy, inspect Atlas access and restore from a verified backup if necessary. Preserve incident evidence without passwords, session tokens, TOTP secrets or recovery codes.
6. An owner who loses the authenticator and all recovery codes needs a trusted Atlas operator to recover that specific account after verifying identity, increment its authVersion and revoke its sessions. There is deliberately no public MFA-bypass endpoint. Lost MFA encryption keys require operator recovery and re-enrollment; never silently disable MFA.

## Verification

Run `npm run check`, `npm test`, `npm run build`, `npm run test:access`, and `npm audit --omit=dev --audit-level=high`. Tests cover RFC 6238 vectors, encryption integrity, one-time code consumption, replay, idle/legacy/disabled sessions, permissions, session ownership, password reauthentication, MFA enrollment expiry, sanitized projections, origin enforcement, malformed routes, bounded streams, cache coalescing, CSP nonces and UI interactions. Authenticated API tests substitute database/cookie boundaries with isolated fixtures; production access tests use a real Next.js server without database credentials. They do not constitute an independent penetration test, live Atlas CRUD test or volumetric DDoS test.


## Control surface isolation

Production `ADMIN_HOST=eia-control-obieda.vercel.app` is an exact HTTP Host allowlist. The proxy, protected server pages and API handler enforce it independently; the student origin and other deployment aliases return 404 for private pages and APIs. Control pages are marked noindex and have no-store responses. Incoming forwarded-host or custom surface headers never authorize access. Public APIs are unavailable on the control origin. Static JavaScript/CSS are public assets and contain no authorization secrets; route obscurity is not an access-control mechanism.

`/admin` calls the same database-backed session verifier used by the API before returning the dashboard component. Anonymous visitors see only the separate `/login` component. Revoked, idle, inactive, stale-auth-version or MFA-unverified sessions cannot authorize the dashboard. Existing host-prefixed cookies do not cross the two origins; sign in afresh on the control origin. Owner/admin/editor enforcement remains in the API, irrespective of navigation visibility. Both origins run on one deployment/database; a distinct host is not a substitute for network or infrastructure isolation.

Production-server regression tests exercise both actual Host authorities through Node HTTP requests, including student API denial with spoofed forwarding headers, server redirects before dashboard rendering, cross-origin write rejection, login routing and no admin links in student HTML. Node native fetch replaces an explicitly supplied Host, so the test transport uses HTTP requests for those cases.


## Student and measurement boundaries

Student authentication uses a separate collection and host-prefixed cookie; it cannot authorize administration even if copied into an admin cookie. Password hashes, email-code challenges and raw device IDs are excluded from student and owner directory responses. Student state and plan ownership come exclusively from the active session. Writes use allowlisted bounded fields, same-origin validation and optimistic concurrency. Students use a platform-specific password and institutional addresses remain unverified until a real, expiring email challenge is consumed. There is no institute identity integration or public recovery bypass.

The optional Resend verifier requires a sender domain controlled by the operator. Keys stay server-only. Codes use purpose-separated HMAC with the stable server MFA key, ten-minute expiry, atomic consumption and account/IP attempt limits; provider failures remove the issued challenge. Verification grants no administrator permissions. Do not invent email verification when provider variables are absent.

Metrics require optional affirmative consent, separate from account/security processing. Cookies are opaque, HttpOnly, host-only and Secure in production. The metrics session lasts at most eight hours. Heartbeats are bounded and compare-and-swap credited, passive telemetry cannot keep student login alive, hidden time and long gaps do not accrue, and a local tab lease limits duplicate timing. Raw sessions have a thirty-day TTL; daily/events and independent account-browser associations have ninety-day TTLs. Opt-out stops future writes but does not erase retained past aggregates. Event data is restricted to section names and published resource/campaign IDs; no searches, URLs or covert fingerprint payloads are accepted.

Only owners can read student emails and shared-browser association groups; owners/admins can see aggregate activity or manage campaigns; editors cannot use these endpoints. Browser IDs are random tokens rather than hardware fingerprints, and associations are a fallible security hint. They must not be interpreted as proof of a single person or automatically used for sanctions. No raw device IDs are exposed. Student source access, owner role enforcement and limits are checked server-side independently of the UI.

Analytics are approximate first-party counters, not independent human verification or ad-billing evidence. Client events can be fabricated, consent and browser limitations affect measurement, and large shared-IP populations can hit existing rate budgets. Aggregations have query deadlines and twenty-second snapshot caching. Text/link campaign cards have no injected HTML, ad scripts, pixels or server-fetched targets. More stringent fraud accounting, infrastructure isolation, reset/recovery workflows and an independent security assessment require separate operational work.
