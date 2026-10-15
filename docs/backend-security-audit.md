# Schurr Automations: backend and security audit

Audit date: September 30, 2026

Baseline: published version 12, source commit `372993161759b2926352b0fbbdaf0be08f70b3f1`.

## Assessment

The review found and repaired concrete availability and access-protection weaknesses. It also replaced dependencies with known security advisories. No confirmed SQL injection, stored cross-site scripting, unauthorized application data read, or deletion authorization bypass was found in the reviewed code.

This is a source, dependency, configuration, and local execution audit. It is not a penetration-test certification. Production identity-header provenance and authenticated browser behavior remain unverified because the hosting edge rejected the audit client before application execution. Provider backup restoration also remains untested.

## Backend structure

| Component | Responsibility | Security boundary |
|---|---|---|
| Sites dispatch and Cloudflare edge | HTTPS, public access, ChatGPT sign-in, identity forwarding | Provider-controlled; application must receive trusted identity and connection headers |
| `build/sites-worker.ts` and `lib/request-policy.ts` | Request admission before Vinext, response security headers | Reject unsupported methods, Server Action headers, multipart actions, ambiguous paths, and unused image endpoints |
| `app/chatgpt-auth.ts` and `lib/owner.ts` | Sign-in and owner authorization | Both authenticated identity fields required; exact configured owner email checked on the server |
| Public HTML routes | Serve the five marketing/privacy pages | Self-hosted scripts; no private inquiry data in page content |
| `lib/inquiries.ts` | Validation, token verification, inquiry storage, reporting, deletion | Prepared SQL, bounded bodies, verified HMAC tokens, atomic transactions, escaped rendering |
| `lib/rate-limit.ts` | Request limits shared across Worker instances | Daily rotating keyed connection fingerprints; source limits checked before shared counters |
| D1 | Structured persistence | Three tables: inquiries, daily_metrics, request_limits; versioned schema migrations |

## Endpoint inventory

| Route | Method and body | Access | Purpose |
|---|---|---|---|
| `/api/inquiry-token` | GET; optional retry key | Public, request-limited | Issue a signed, origin-bound, 20-minute form token |
| `/api/inquiries` | POST, JSON, maximum 12 KiB | Public, exact origin, valid token, validated fields, request-limited | Save an inquiry; return its receipt only after commit |
| `/api/metrics` | POST, JSON, maximum 1 KiB | Public, exact origin, fixed event/page/service categories, request-limited | Increment aggregate activity counts |
| `/manage/inquiries` | GET | Signed-in approved owner | View and paginate records; prepare explicit deletion |
| `/manage/metrics` | GET | Signed-in approved owner | View the last 30 days of aggregate activity |
| `/api/manage/inquiries` | POST, URL-encoded, maximum 512 bytes | Signed-in approved owner and exact origin | Delete one validated inquiry ID |

No public inquiry-list endpoint, upload handler, payment processor, outbound messaging service, or application Server Action is registered. The marketing site's AI service descriptions are not live model integrations; there is no model API key, voice connection, or client-business integration in this backend.

## Confirmed findings and repairs

| Finding | Assessed priority | Evidence before repair | Repair |
|---|---|---|---|
| Affected React Server Components package in the deployed bundle | High | `react-server-dom-webpack` 19.2.6 was bundled despite its development-dependency classification. Framework action decoding existed before page authorization. | React, React DOM, and RSC upgraded together to 19.2.8. Unused explicit and progressive Server Actions rejected before framework execution. |
| One source could consume all inquiry capacity | High | Local route execution accepted 500 anonymous submissions; the next independent visitor received 429. | Source limits: 3 new submissions per 15 minutes and 10 per UTC day. Shared daily admission limit retained. Committed retries remain available. |
| Unrestricted anonymous metric writes | Medium | 501 requests produced 501 writes to one metric bucket. | Per-source and shared short-window/daily limits. Unknown event fields rejected before admission. |
| Missing application clickjacking protection | Medium | Owner pages with permanent-delete controls had no frame restriction in application response headers. Provider headers were not established. | Owner responses send `frame-ancestors 'none'` and `X-Frame-Options: DENY`. Owner links open at the top level. |
| Unused framework decoding exposed behind API paths | Medium, defense in depth after patch | Headerless multipart POSTs could enter Vinext's progressive action decoder before the API handler's content-type check. | Route-specific method and content-type allowlists applied at the outer Worker. |
| Old records became inaccessible | Low at current volume | Offset pagination stopped after the newest 10,100 records. Older retained records could not be selected for review/deletion. | Indexed cursor pagination with 100 records per page and no fixed record-count ceiling. |
| Stale navigation asset request | Operational | Recent production log contained a 404 for `/why.js` from an older page. | Restored a compatible navigation script at that path. Dynamic HTML is non-cacheable. |

The dependency audit initially reported 53 advisory entries: 1 critical, 26 high, 19 moderate, and 7 low. These are dependency findings, not 53 independently demonstrated website exploits. The critical Next.js advisory concerns a Node image-generation feature absent from this application; no reachable image-generation RCE was established. Next and its lint configuration were nevertheless updated to 16.3.6. Vite and affected transitive packages were patched while retaining the existing release-age policy.

The full post-update dependency audit, including development packages, reports zero known advisories. This does not establish the absence of undisclosed vulnerabilities.

## Verification evidence

The repository contains reproducible checks:

- `tests/backend.test.cjs`: 12 groups covering signed tokens, origin validation, request bounds, validation, atomic persistence, rollback, duplicate retries, prepared queries, metrics, owner deletion, and daily intake behavior.
- `tests/intake-security.test.cjs`: 12 groups covering source isolation, concurrent limits, daily limits, token and metric limits, bounded cleanup, fingerprints, shared-cap storage bounds, and cursor traversal.
- `tests/auth-security.test.cjs`: 9 groups covering the actual authentication helper, owner authorization, rendered hostile data, sign-in return paths, Worker admission order, response headers, and frame behavior.
- `tests/site-content.test.cjs`: page metadata, local assets, anchor targets, contact paths, distinct briefs, and the ten PDF downloads.

Specific adverse checks include 300 rejected token requests and 1,001 rejected metric requests without consuming shared capacity. Pagination retrieved all 10,251 test records across 103 pages, including thousands of equal timestamps, without omissions or duplicates. An exhausted shared limit prevented 100 fresh sources from creating additional limiter records.

The TypeScript check and production build pass. Migration generation also runs with the patched toolchain; the new migration only adds the request-limit table and its expiry index. Applied migration history was preserved.

Current-source credential-pattern scanning found no matches for the tested key formats. No environment files are tracked. The client build contains no source maps or owner/signing-secret/authentication-header markers. This is a scoped scan, not a guarantee that every possible secret format would be recognized.

## Data handling and operational controls

Inquiry contact information and messages remain in D1 until explicitly deleted by the owner. Public API responses do not expose those records. Application errors omit request bodies and contact data. Provider request logs may contain connection addresses and other technical metadata, as explained in the privacy page.

Analytics retains fixed daily counts, not visitor identifiers or contact information. Security limiting uses a separate, daily rotating HMAC derived from the Cloudflare connection header. Raw addresses are not saved by the limiter. Counter records expire within 24 hours and are removed in bounded batches during subsequent requests; physical removal is not promised at an exact wall-clock deadline during inactivity.

`X-Forwarded-For` and `X-Real-IP` are ignored for allocating allowances. Missing or malformed trusted connection headers share one fallback allowance. Requests already denied by a source limit cannot consume shared counters. When a shared cap is already full, new sources cannot create additional limiter rows. These application controls do not replace upstream DDoS protection.

All dynamic responses use `private, no-store`, including error and RSC responses. Responses have MIME protection, referrer restrictions, a permissions policy, and HTTPS HSTS without subdomain or preload directives. Public HTML restricts executable scripts to its own origin. The owner area's CSP restricts framing, object loading, form destinations, and base URLs; it does not claim a strict script policy because the framework uses inline RSC bootstrap scripts.

Cloudflare documents automatic D1 encryption at rest and TLS in transit. These are provider properties, not independent cryptographic measurements made during this audit.

## Remaining requirements and limits

1. **Verify the hosting identity boundary with an allowed live client.** Anonymous requests carrying forged owner headers must remain anonymous. A normally signed-in non-owner must see no inquiry data. Confirm that no alternative origin bypasses Sites dispatch. Local checks mock the provider boundary and cannot prove these properties.
2. **Complete signed-in browser verification.** Confirm owner sign-in, inquiry submission, inbox receipt, deletion, and the final response headers. Both anonymous and forged-header audit requests were stopped by Cloudflare error 1010 before application execution; those responses are not evidence that application authorization passed.
3. **Confirm recovery access and perform a restore drill.** Cloudflare documents automatic Time Travel for supported D1 databases, with plan-dependent history. This session's Sites tools expose schema/row reads, not provider restoration. This site's retention tier, restore access, and successful recovery have not been demonstrated. Do not run a destructive restoration against production merely to test it.
4. **Choose an inquiry retention period.** The current policy is manual deletion, accurately disclosed. No arbitrary deletion schedule was imposed on business records.
5. **Confirm owner-account protection and alerting.** MFA/recovery settings and automatic error notifications were not accessible to this audit. The application has no local password store or password-reset implementation. There is no automatic inquiry email notification or configured on-call alert channel.
6. **Retain edge abuse controls.** Per-source limits assume the documented hosting connection header is trustworthy. Distributed sources can still consume global capacity, and rejected traffic still costs request handling. Edge challenge/rate controls require provider configuration beyond the application limits.

## Primary references

- React advisory, GHSA-wx67-qw84-cm4g: https://github.com/react/react/security/advisories/GHSA-wx67-qw84-cm4g
- Next.js advisory, GHSA-vcvr-r3jv-pc5j: https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j
- OWASP Content Security Policy guidance: https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- Cloudflare request-header behavior: https://developers.cloudflare.com/fundamentals/reference/http-headers/
- D1 data security: https://developers.cloudflare.com/d1/reference/data-security/
- D1 Time Travel and backups: https://developers.cloudflare.com/d1/reference/time-travel/
