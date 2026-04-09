# IJDR Journal Portal — Remaining work

This file lists **what is still open** after the current implementation (Angular 19, Firebase, hardened rules, GA4/Performance in app, Admin Insights/Messages, contact form, sitemap/RSS, `getPdf` streaming without `viewCount`, session-deduped views, SEO tags on issue pages, etc.).

**Principles (unchanged):** free core features only; Firebase-first; no extra third-party analytics scripts; paid AI is a separate future track (see end of doc).

---

## 1. Google Console & ownership (not in git)

| Task | Notes |
|------|--------|
| **GA4 linked to Firebase** | Firebase Console → Project settings → Integrations → Google Analytics. Web data stream for production host (`ijdrpub.in`). |
| **Stakeholder access** | Share GA4 (Viewer) and/or Firebase project access; keep an internal doc of URLs and who has access. |
| **Google Search Console** | Verify `ijdrpub.in`, submit `https://ijdrpub.in/sitemap.xml`, monitor coverage and fix indexing issues. |

---

## 2. Security & abuse hardening

| Task | Notes |
|------|--------|
| **Firebase App Check** | Enable for the web app (reCAPTCHA v3 or Play Integrity as appropriate); optionally verify tokens on sensitive HTTP functions (e.g. `getPdf`) — tradeoffs vs public PDF sharing. |
| **`getPdf` mitigations** | Today: public PDFs, `Access-Control-Allow-Origin: *`. Tighten CORS/referer only if product moves to authenticated or App Check–gated PDF access. |
| **Hosting security headers** | Gradually add **Content-Security-Policy**, **Referrer-Policy**, **Permissions-Policy** in `firebase.json` after testing on staging. |

---

## 3. Optional Cloud Functions & data

| Task | Notes |
|------|--------|
| **`scheduledStatsRollup`** | Scheduled function writing `stats/daily/{yyyy-mm-dd}` for optional Admin charts / sparklines (not built yet). |
| **`onContactCreated`** | Email notify admins on new `contactSubmissions` — only if you accept SMTP/SendGrid (or similar) and secrets in **Secret Manager**. |
| **Runtime upgrade** | Move Functions from Node 18 to **Node 20** (or current Firebase LTS) in a planned window. |
| **Functions 2nd gen** | Optional migration for concurrency/IAM — not required for current scale. |

---

## 4. Operations & quality

| Task | Notes |
|------|--------|
| **Emulator workflow** | Firestore + Functions + Hosting emulators in CI or a documented pre-deploy checklist. |
| **Secrets** | No SMTP/API keys in repo; use **Google Cloud Secret Manager** or `defineSecret` where needed. |
| **Observability** | **Cloud Logging** for functions; optional **billing alerts** in GCP. |
| **Rules testing** | Optional automated or manual matrix: anonymous vs admin vs non-admin auth for each collection. |

---

## 5. Product / UX (optional polish)

| Task | Notes |
|------|--------|
| **Custom GA4 events** | e.g. `journal_open`, `pdf_view` — naming consistent with GA4; avoid PII in parameters. |
| **Dedicated volume/issue filters** | Journals list already has year, sort, and search; add explicit volume/issue controls only if editors need them. |
| **Home announcement banner** | `siteSettings` (or similar) in Firestore + banner on home (“New issue: …”) — rules placeholder exists; **no client UI wired yet**. |
| **SSR / prerender** | If issue URLs remain weak in Search, consider **Angular SSR or prerender** for key routes (Phase-2 style). |

---

## 6. Future: paid AI (do not start before core is stable)

Budgeted track only: Vertex AI / Gemini or other providers; server-side calls; App Check + auth; cache outputs in Firestore; editorial policy and privacy updates. See historical full spec in git history if needed.

---

*Last aligned with codebase snapshot: Firebase rules, Hosting rewrites (`/pdf`, `/sitemap.xml`, `/rss.xml`), Admin Insights/Messages, contact pipeline, analytics bootstrap.*
