# IJDR Journal Portal — Developer Handoff: Roadmap (Free & Firebase-First)

**Purpose:** This document is the single spec for continuing development of **journal-portal** (Indian Journal of Development Research — [ijdrpub.in](https://ijdrpub.in/)).  

**Business goals:** Reach more people, improve recognition, increase site traffic (“hits”), and **measure traffic reliably**.

**Constraints (mandatory):**

1. **Free only** — No paid SaaS analytics, no paid marketing tools, no paid APIs for **core** features (analytics, SEO, contact, admin).
2. **Firebase-first** — Prefer the same Firebase/Google project you already use (Firestore, Storage, Auth, Functions, Hosting). Avoid adding separate third-party analytics or tracking products unless explicitly approved later.
3. **Google ecosystem is allowed** where it integrates with Firebase (e.g. GA4 enabled from the Firebase console, Google Search Console for search visibility). Treat these as extensions of your existing stack, not new vendors.
4. **Paid AI (future)** — Artificial-intelligence features are **explicitly out of the free core** and planned as a **separate, budgeted track**; see **Part H**.

**Current stack:** Angular 19 (SPA), Bootstrap 5, Firebase (Auth, Firestore, Storage), Cloud Function PDF proxy (`getPdf`), PDF.js + iframe fallbacks, route SEO via `Title`/`Meta`, per-issue `viewCount` in Firestore.

---

## Part A — Chosen solution: how we measure “hits” (no extra vendors)

Use **two complementary layers**, both compatible with a free setup and centered on Firebase + Google.

### A.1 Primary: Google Analytics 4 (GA4) via Firebase

**Decision:** Use **Google Analytics 4 linked to the Firebase project** as the single source for site-wide traffic: sessions, users, pages, devices, geography, traffic sources, and funnels.

**Why this is the best fit here**

- **Free** at IJDR’s expected traffic levels.
- **Native to Firebase:** Enable Analytics in [Firebase Console](https://console.firebase.google.com/) → Project settings → Integrations → Google Analytics. The Web app stream gives you a **Measurement ID** (`G-XXXXXXXX`).
- **One login** for Firebase + Analytics reporting (Firebase Console shows high-level usage; GA4 property gives deeper reports).
- No Plausible, PostHog, Clarity, Umami, or other trackers — keeps privacy policy and implementation simpler.

**Developer tasks**

1. In Firebase Console: create/link GA4 property; add **Web** data stream for production domain (`ijdrpub.in`).
2. In Angular: add `**@angular/fire/analytics`** (aligned with your existing `@angular/fire` version). Use `provideAnalytics(() => getAnalytics())` in `app.config.ts` (or equivalent pattern for your setup).
3. **Single Page App:** On each `NavigationEnd`, log a page view (e.g. `logEvent(analytics, 'page_view', { page_path: url, page_title: title })`) or use the recommended GA4 SPA pattern so route changes count as page views.
4. Optionally log custom events (free): `journal_open`, `pdf_view`, `contact_submit` — use clear naming and avoid collecting personal data in event parameters.
5. **Do not** add a second web analytics script from another company.

**Editor / admin access:** Share the GA4 property with editorial staff (Viewer role) or share **Firebase Console** project access so they can see usage without custom dashboard code.

---

### A.2 Secondary: Firebase Performance Monitoring (optional but recommended, free)

**Decision:** Enable **Firebase Performance Monitoring** for the web app.

**Why:** Free automatic metrics (page load, network) help catch slow PDF or bundle issues that hurt SEO and bounce rate.

**Developer tasks:** Add `@angular/fire/performance` and initialize Performance in the app bootstrap per AngularFire docs.

---

### A.3 Product metrics in your own database: `viewCount` (Firestore)

**Decision:** Keep **per-issue popularity** in Firestore `viewCount` for display on cards and for an **in-app Admin “Insights”** section.

**Critical:** Fix **double/triple counting** (today increments may fire from modal open, `/journal/:id`, and `getPdf`). Pick **one authoritative increment** (recommended: **only** when serving PDF via Cloud Function, **or** only on first meaningful view of `/journal/:id` with `sessionStorage` dedupe — not both everywhere).

**Developer tasks**

1. Implement single source of truth for increment + optional session dedupe.
2. Admin UI: table/chart of issues sorted by `viewCount` + last updated.
3. Add short **tooltip/help text** in admin: “Views ≈ times the issue was opened (not unique visitors).”

---

### A.4 Admin dashboard: what to build in-app vs link out


| Need                               | Implementation                                                             | Cost                          |
| ---------------------------------- | -------------------------------------------------------------------------- | ----------------------------- |
| Global traffic, sources, geography | **GA4** (Firebase-linked) — link from Admin or document URL for editors    | Free                          |
| Issue popularity                   | **Firestore** `viewCount` + Admin UI                                       | Free (Firestore reads)        |
| Optional rollups                   | **Scheduled Cloud Function** (e.g. daily) writing `stats/daily` aggregates | Free tier if volume stays low |


**Do not** build a full duplicate of GA4 inside the app. **Do** add an **Admin → Insights** page with: top issues by `viewCount`, link/button “Open Analytics in Google” / Firebase Console, and (optional) last-7-days sparkline from `stats/daily` if you add the Function later.

---

### A.5 Discoverability metrics (free, Google — not Firebase but same account family)

**Decision:** Use **Google Search Console** (free) for the property `ijdrpub.in`: impressions, clicks, queries, indexing issues.

**Why:** This directly supports “more hits from Google” and is separate from GA4 but essential for SEO.

**Developer / owner tasks:** Verify domain, submit `sitemap.xml` (see Part B), fix coverage errors.

---

## Part B — Technical work that increases reach (free, mostly Firebase Hosting + app)

### B.1 SEO and crawlability (high impact for “more people find us”)

1. `**public/robots.txt`** — Allow crawlers; reference absolute URL of sitemap.
2. `**sitemap.xml**` — Include static routes + every `/journal/{id}` (generate at build time from exported data **or** lightweight **HTTPS Cloud Function** that reads Firestore `journals` and returns XML — stays on Firebase).
3. **Canonical URLs** — `<link rel="canonical">` per route; issue pages must point to the preferred URL.
4. **Open Graph + Twitter** on `/journal/:id` — Update `og:title`, `og:description`, `og:url` (and Twitter equivalents) when issue loads, not only `<title>` and meta description.
5. **SPA limitation:** If indexing of issue pages stays weak, plan a later phase for **Angular SSR or prerender** for key routes (still hostable on Firebase / Cloud Functions) — note as Phase 2 if needed.

### B.2 Code health — Angular / client (free improvements)

1. Remove unused `**@apollo/client` / `apollo-angular` / `graphql`** if still unused — smaller bundle, faster loads (helps SEO).
2. Align **PDF.js** loading (CDN vs bundled worker) to **one version** to avoid bugs and duplicate downloads.
3. `**FirebaseJournalService`:** Replace `docData().subscribe()` side effects in `updateJournal` / `deleteJournal` with `**getDoc`** (await) so Storage deletes run in order.
4. Replace `**alert` / `confirm**` with Bootstrap modals or toasts for accessibility.

### B.3 Security — high-level (details in Part G)

- **Tighten Firestore and Storage rules** (see **Part G.1–G.2**) — current rules are not production-safe.
- Add **Firebase App Check** when feasible (free tier) to reduce abuse on Functions and public writes.
- Extend **Firebase Hosting** `headers` in `firebase.json` if needed (CSP, Referrer-Policy) after testing.

---

## Part G — Backend & infrastructure (Firebase server-side) — **required changes**

This section covers **Cloud Functions**, **Security Rules**, **indexes**, and **hosting rewrites**. Several items are **not optional** for a production journal site.

### G.1 Firestore security rules — **critical**

**Current issue (as in repo):** A catch-all rule allows **any authenticated user** to **read and write every document** in the database:

```text
match /{document=**} {
  allow read, write: if request.auth != null;
}
```

That means a leaked or shared editor password, or any second account with sign-up enabled, could **read or wipe unrelated data**. This must be **removed** for production.

**Required direction**

1. **Delete** the `/{document=**}` authenticated wildcard (or replace with explicit denies only after all collections are covered).
2. **List each collection explicitly** with least privilege, for example:
  - `journals` — public `read`; `write` only if `request.auth.token.admin == true` **or** `request.auth.uid` is in an `admins` allowlist document (choose one model and document it).
  - `boardMembers` — public `read` for active members (or public read if the app filters `isActive` client-side — prefer querying only active in rules if modeled that way); `write` admin-only.
  - `articles` — same pattern if used.
  - `admins/{uid}` — user can `read` own doc; writes only via Admin SDK / console, or admin-only.
  - `contactSubmissions` — **create** from anonymous or authenticated users with **field validation** (max length, required fields); **no public read**; **read/update** admin-only (for “mark as read”).
3. **Admin authorization:** Prefer **Firebase Auth custom claims** (`admin: true`) set via a one-off Admin script or Callable Function (callable itself protected). Avoid “any logged-in user is an editor” unless only one account exists and sign-up is disabled.

**Backend developer tasks**

- Redesign `firestore.rules`; deploy and test with **Firebase Emulator Suite**.
- Add rules unit tests or manual test matrix (anonymous vs admin vs random auth user).
- Add `**firestore.rules`** entries for any new collections (`contactSubmissions`, `stats`, etc.).

---

### G.2 Cloud Storage rules — **production hardening**

**Current pattern:** Global `read: if true` and `write: if request.auth != null` for all paths.

**Issues**

- Any authenticated user can upload **anywhere** in the bucket (not only `journals/` or `boardMembers/`).
- Public read may be **required** for journal PDFs if the app uses direct download URLs; if PDFs are served **only** via `getPdf` + Storage access restricted to the service account, rules can be tighter (advanced).

**Required direction**

1. **Scope `write`** to paths the app actually uses, e.g. `journals/{journalId}/{fileName}`, `boardMembers/{memberId}/{fileName}`, and **only** for admins (same claim as Firestore).
2. Keep `**read`** as needed for current PDF URLs (often public `read` on `journals/**` only); avoid `read: if true` on the entire bucket if you can narrow paths.
3. Update `storage.rules`; test uploads from Admin UI after changes.

---

### G.3 Cloud Function `getPdf` — behavior and hardening

**Current role:** HTTP function (v1 style) streams PDF from Storage; increments `viewCount` on every successful GET; `Access-Control-Allow-Origin: *`; hosted rewrite `/pdf/`** → `getPdf`.

**Backend improvements**


| Topic                   | Recommendation                                                                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **View counting**       | Align with **Part A.3**: either **only** increment here, or remove increment here and keep client path — **not both**. Consider **dedupe** (e.g. short-lived cookie, or accept raw counts as “proxy requests”).                                   |
| **Abuse / hotlinking**  | Prefer **Firebase App Check** on the **Angular app** + verify App Check token in Function if you add a lightweight token query/header pattern, **or** restrict `Referer`/host to `ijdrpub.in` where feasible (fragile alone). Document tradeoffs. |
| **CORS**                | `Access-Control-Allow-Origin: *` is broad; acceptable if the asset is public PDFs, but tighten if you add auth.                                                                                                                                   |
| **Runtime**             | `functions/package.json` uses **Node 18**; migrate to **Node 20** (or current Firebase default LTS) when upgrading `firebase-functions` — plan in a maintenance window.                                                                           |
| **v2 functions**        | Optional migration to **Cloud Functions 2nd gen** for concurrency and IAM; not mandatory for launch.                                                                                                                                              |
| **Attachment download** | Optional query param `?disposition=attachment` to set `Content-Disposition: attachment` for “Download” vs inline (product feature).                                                                                                               |


---

### G.4 New / extended Cloud Functions (free tier, same project)


| Function                                       | Purpose                                                                                                                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `**sitemap`** (HTTP)                           | `GET` returns `application/xml` sitemap from Firestore `journals` IDs + static paths; Hosting rewrite e.g. `/sitemap.xml` → function (or generate at deploy time — either is fine). |
| `**scheduledStatsRollup**` (pub/sub scheduled) | Daily: write `stats/daily/{yyyy-mm-dd}` with aggregate `viewCount` sum or top-N snapshot for Admin charts (optional).                                                               |
| `**onContactCreated**` (Firestore `onCreate`)  | Optional: notify admin email via **Gmail SMTP / SendGrid** only if product owner accepts a mail provider; otherwise skip.                                                           |


**Indexes:** Add `**firestore.indexes.json`** composite indexes for any new queries (e.g. `contactSubmissions` ordered by `createdAt`).

---

### G.5 Firebase Hosting (`firebase.json`)

- **Rewrites:** After adding `sitemap` function, add rewrite for `/sitemap.xml` **before** the `**` → `index.html` rule.
- **Headers:** Consider **Content-Security-Policy** gradually; validate with staging. **Referrer-Policy** / **Permissions-Policy** as needed.

---

### G.6 Operations and quality

- **Emulators:** Use Firestore + Functions + Hosting emulators in CI or pre-deploy checklist.
- **Secrets:** Store SMTP or third-party keys in **Google Cloud Secret Manager** (or Functions `defineSecret`) — not in repo.
- **Logging / alerts:** Use **Cloud Logging**; optional budget alerts in GCP console.

---

## Part C — UX and features (free; Firebase-first where backend is needed)

### C.1 Journals UX

- Skeleton loaders on home + journals list (dependency `ngx-skeleton-loader` already present).
- Filters: year, volume/issue; sort by newest / most viewed (`viewCount`).
- Empty states when no issues.

### C.2 Contact (no paid email API required)

**Preferred (Firebase-only path):**  

- Contact **form writes to Firestore** collection `contactSubmissions` (fields: name, email, message, `createdAt`, `read: false`).  
- **Admin UI:** “Messages” inbox to list/mark as read.  
- **Rules:** Must be defined in **Part G.1** (public create with validation; admin read).
- Optional: **Cloud Function** `onCreate` — see **Part G.4**.

### C.3 Trust and recognition (content, not code cost)

- Visible **ISSN**, publisher, indexing claims only when accurate.
- **“How to cite”** snippet on site footer or about page.
- Stable **URLs** for each issue (`/journal/:id`).

### C.4 Optional free “reach” mechanics

- **RSS feed** of new issues: Cloud Function or static file regenerated on publish — no third-party.
- **Announcement** doc in Firestore + show banner on home (“New issue: Vol. X”) — Firebase-only.

---

## Part D — Out of scope for the *free core* spec

The following are **not** part of the mandatory free delivery (except where noted as optional free mail):

- Third-party analytics (Plausible, PostHog, Microsoft Clarity, Umami, etc.).
- Paid email marketing (Mailchimp, Brevo, etc.) — optional later.
- **Paid AI** — planned separately; see **Part H** (stakeholder is willing to budget for this later).

---

## Part H — Future track: paid AI capabilities (futuristic / budgeted)

**Status:** Not part of Phase 1–5. Implement only after **security rules (Part G)** and **core analytics/SEO** are stable. All items below incur **API, compute, or vendor cost**; require **editorial policy** (accuracy, disclosure, no replacement for peer review).

### H.1 Recommended platforms (Firebase / Google alignment)


| Option                            | Use case                                             | Notes                                                                      |
| --------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------- |
| **Vertex AI** (Gemini)            | Summarization, classification, Q&A over your content | Same GCP billing as Firebase project possible; pay per token/request.      |
| **Gemini API** (Google AI Studio) | Prototyping, smaller integrations                    | Pricing separate from Firebase; good for experiments.                      |
| **OpenAI / Anthropic**            | Alternative LLMs                                     | Third-party; compare cost and data-processing terms for scholarly content. |


### H.2 Feature ideas (prioritize after ROI discussion)

1. **Issue-level plain-language summary** — Input: title + description (+ optional extracted text); output cached in Firestore; **human approval** before publish.
2. **Semantic / hybrid search** — Embeddings for titles/abstracts; vector store (Firestore extensions, Vertex AI Vector Search, or managed DB); “related issues” widget.
3. **RAG assistant** — Grounded Q&A on contributor guidelines, ISSN, submission steps; disclaimer UI; rate limits via Cloud Functions.
4. **TOC or metadata extraction from PDF** — Layout-aware parsing + LLM cleanup; admin review before exposing links.
5. **Multilingual summaries** — e.g. Hindi blurbs for outreach; editorial sign-off.

### H.3 Architecture pattern (when you start)

- **Cloud Functions (Callable or HTTP)** with **authentication** + **App Check**; **no API keys in the client**.
- **Store prompts and model version** in logs for reproducibility; **cache** LLM outputs on `journals/{id}` fields (`aiSummary`, `aiSummaryApprovedAt`) to control cost.
- **Privacy:** Do not send reader PII to models; be explicit in Privacy Policy about AI processing of **published** or **admin-uploaded** content.

### H.4 Checklist (AI phase — do not start before core launch)

- Budget + model choice approved  
- Editorial policy for AI-generated text  
- Server-side only invocation; secrets in Secret Manager  
- Caching + quotas + monitoring (Cloud Logging / billing alerts)

---

## Part E — Implementation phases (developer execution order)


| Phase                  | Deliverables                                                                                                    | Supports goals                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **0 — Backend safety** | **Firestore + Storage rules** fixed (remove auth wildcard); admin custom claims or equivalent; emulators tested | **Production-safe data**        |
| **1 — Measure**        | Enable GA4 in Firebase; Angular Analytics + SPA page views; optional Performance Monitoring                     | Know total hits, sources, pages |
| **2 — Trust metrics**  | Fix `viewCount` semantics + dedupe (client + **getPdf** alignment); Admin Insights                              | Honest per-issue popularity     |
| **3 — Be found**       | `robots.txt`, `sitemap` (Function or build), canonical + OG on issue pages; Search Console                      | More organic hits               |
| **4 — Polish**         | Skeletons, modals, contact → Firestore inbox + rules, code cleanups (Apollo, `getDoc`, PDF.js)                  | UX + retention                  |
| **5 — Optional**       | Scheduled stats rollup; RSS; SSR/prerender; `getPdf` Node/runtime upgrade; Functions v2                         | Scale & maintainability         |
| **H (later)**          | **Part H** paid AI features                                                                                     | Differentiation                 |


---

## Part F — Checklist (copy into issue tracker)

**Backend / security (priority)**

- **Remove** Firestore `/{document=**}` allow-all for authenticated users; **explicit rules** per collection  
- **Admin-only writes** via custom claims or documented allowlist model  
- `**contactSubmissions`** rules: validated create; no public read  
- **Tighten Storage rules** to path prefixes + admin write only  
- `**getPdf`:** align `viewCount` with global strategy; plan App Check / abuse mitigations  
- Optional: **sitemap** HTTP Function + Hosting rewrite  
- Optional: **scheduled** stats Function + indexes for new queries  
- **Node/runtime** upgrade plan for Functions

**Analytics & tracking**

- Enable **Google Analytics 4** for the Firebase project; Web data stream for production domain  
- Add **AngularFire Analytics**; log **page views** on route change  
- (Optional) **Firebase Performance Monitoring** for web  
- Document **GA4 / Firebase Console** URLs and editor access for stakeholders

**Hits & product data**

- **Single** `viewCount` increment strategy + optional **session dedupe**  
- Admin **Insights**: sort issues by `viewCount`; help text defining “Views”

**Discovery (SEO)**

- `public/robots.txt` + **sitemap**  
- **Canonical** + **Open Graph** (and Twitter) on `/journal/:id`  
- **Google Search Console**: verify site, submit sitemap

**Reliability & quality — client**

- `updateJournal` / `deleteJournal`: use `**getDoc`** instead of subscribe for Storage delete flow  
- Remove unused **Apollo/GraphQL** deps if confirmed unused  
- Unify **PDF.js** version strategy

**Engagement (free)**

- Contact form → **Firestore** + Admin inbox (optional Function email only if approved)

**Not in scope (core)**

- No additional third-party analytics scripts

**Future (paid — Part H)**

- AI features only after stakeholder approval and budget

---

## Summary for stakeholders

- **Backend is not “done”:** Firestore rules as currently structured are **unsafe for production**; Storage rules are **overly permissive** for writes. **Part G** is mandatory technical debt before scaling traffic or adding contact forms.
- **“Hits”** = **Google Analytics 4** (Firebase-linked) + **Search Console**; per-issue popularity = `**viewCount`** in Firestore after a **single** increment strategy.
- **Growth** = SEO + indexing + partnerships — free core; **AI** = **Part H**, paid when you are ready.

---

*Document version: Firebase-first free core + backend hardening + future paid AI track. Aligned with codebase review of `journal-portal` (Angular + Firebase).*