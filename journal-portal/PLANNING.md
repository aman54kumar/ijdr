# IJDR Modernization Plan

Phased plan to modernize the IJDR portal (live at https://ijdrpub.in) in functionality and UI, using the free Gemini API for AI features.

**How to use this doc:** tell Claude "work on Phase N from PLANNING.md". Each phase is self-contained and lists its prerequisites, tasks, files, acceptance criteria and verification. Phases build on each other in order. Do not start Phase N+1 until Phase N's acceptance criteria are met and its status below is updated.

## Status

| Phase | Title | Status |
|-------|-------|--------|
| 0 | Repo hygiene and safety | Done (3 user follow-ups deferred, see notes) |
| 1 | Design foundation and UI polish | Done (covers backfilled; not deployed) |
| 2 | Content model: articles + admin entry | Not started |
| 3 | Gemini ingest pipeline | Not started |
| 4 | Discovery: article pages, search, citations, SEO | Not started |
| 5 | AI reader features | Not started |
| 6 | Reader experience: PDF viewer, PWA, performance | Not started |
| 7 | Admin dashboard, analytics, submissions | Not started |

## Ground rules (apply to every phase)

- Stack: Angular 19 (standalone components, Bootstrap 5, `@angular/fire`), Firebase (Firestore, Storage, Auth, Hosting, Functions on Node 22 / firebase-functions 7). Keep it Firebase-first; no new paid services.
- **Never put the Gemini API key in the browser or in git.** Gemini is called only from Cloud Functions, with the key in Secret Manager via `defineSecret('GEMINI_API_KEY')`.
- Every AI call is **cached in Firestore** and happens once per input (per issue / per article), never per page view. The free tier has tight rate limits.
- AI output is a **draft**: admins review before anything is published. Public pages label AI-generated content as such.
- Keep existing behavior working. Don't rename existing collections/fields (`journals`, `boardMembers`, `contactSubmissions`, `siteSettings`); only add.
- Firestore/Storage rule changes ship with the feature that needs them, and are tested with the emulator or a manual matrix (anonymous / non-admin / admin).
- Match existing code style: standalone components, `.html` + `.scss` per component, services in `src/app/services`, types in `src/app/type`.
- Before finishing any phase: `npm run build` passes, `npm test` still passes, and the feature is checked in a browser at desktop and mobile widths.
- Commit per phase (or per logical step) with a clear message. Don't deploy without the user's go-ahead.

### Current-state facts the plan relies on
- Data model: `journals` docs are issue-level only (title, edition, volume, number, year, ISSN, `pdfUrl`, `pdfFileName`, `fileSize`, `viewCount`). See `src/app/type/journals.type.ts`.
- `articles` collection has Firestore rules (public read, admin write) but **no data and no UI**. `ArticlesComponent` is an empty stub and is not routed.
- Functions in `functions/src/index.ts`: `getPdf` (PDF proxy, `/pdf/**`), `sitemap`, `rssFeed`. Hosting rewrites are in `firebase.json`.
- Issue PDFs are uploaded to Storage under `journals/` from the admin panel (`FirebaseJournalService`, `admin.component.ts`). Storage rules: public read, admin write.
- Styles: global design tokens as CSS variables in `src/styles.scss` (Inter + Playfair Display). Home hero uses a purple gradient.
- Admin auth: Firebase Auth with the `admin` custom claim (`functions/scripts/setAdminClaim.js`).
- Analytics/Performance are initialized in `app.config.ts`.

---

## Phase 0 — Repo hygiene and safety

**Goal:** a clean repo and no leaked secrets, so later phases don't fight noise or risk.

**Prerequisites:** none.

**Tasks**
1. Untrack committed junk: `ijdr-env/` (Python virtualenv), `journal-portal/functions/node_modules/`, any `__pycache__`, `db.sqlite3`. Use `git rm -r --cached` and extend the root `.gitignore` (the root has none) and `journal-portal/.gitignore` (add `functions/node_modules`, `functions/lib` only if lib is not meant to be committed; check `firebase.json` predeploy first, since recent commits rebuild `lib` by hand).
2. Audit `journal_backend/firebase_key.json`. If it is a real service-account key: tell the user to **rotate it in Google Cloud Console** and decide on history rewrite (do not rewrite history without the user's explicit approval). Then untrack it and add to `.gitignore`.
3. Large binaries: the sample PDFs in `journal_backend/` should not live in git. Untrack and ignore (confirm with the user first).
4. Add `journal-portal/.env.example` / document where `src/environments/firebase-config.ts` comes from (it is gitignored); confirm `scripts/check-firebase-config.js` still works.
5. Decide the fate of `journal_backend/` (unused by the live site). Do not delete; add a note in the root README that it is optional/legacy.
6. Create the Gemini secret placeholder docs: add a "Secrets" section to `DEPLOYMENT.md` explaining `firebase functions:secrets:set GEMINI_API_KEY`.

**Acceptance criteria**
- `git status` is clean after a fresh `npm ci` in both `journal-portal` and `functions`.
- No credentials tracked (`git ls-files | grep -i key` reviewed).
- App builds and `firebase deploy --only functions` dry-run still resolves dependencies.

**Out of scope:** history rewriting (needs explicit user approval), deleting the Django backend.

**Notes/deviations:** `functions/lib` stays tracked (no predeploy build). `admin-setup.service` and `defaultAdminConfig` removed. Sample PDFs untracked. Password scrubbed from local history (backup bundle in scratchpad). Clean checkout and `firebase deploy --only functions --dry-run` verified. **Deferred for the user:** (1) force-push the rewritten history, (2) change the old admin password in Firebase Auth, (3) decide on rotating `firebase_key.json`.

---

## Phase 1 — Design foundation and UI polish

**Goal:** make the site look and feel like a modern scholarly publication, and give later phases a consistent set of tokens and components. No new data or backend.

**Prerequisites:** Phase 0 (optional but preferred).

**Tasks**
1. **Design tokens.** Consolidate `src/styles.scss` variables into a semantic set (`--bg`, `--surface`, `--text`, `--text-muted`, `--border`, `--brand`, `--accent`, radii, shadows, spacing). Components should use semantic tokens, not raw palette values.
2. **Dark mode.** Add `prefers-color-scheme` support plus a manual toggle in the header (persist choice in `localStorage` with try/catch; set `data-bs-theme` / `data-theme` on `<html>`). Verify every page and the PDF viewer chrome in both themes.
3. **Typography and tone.** Use Playfair Display for headings and Inter for UI; tighten spacing; reduce gradients and decorative badges; hero becomes calmer and more editorial. Keep the brand colors recognizable.
4. **Home page** (`home.component.*`): stats strip (issues, years, total views from existing data), "Most read" row (from `viewCount`), clearer primary CTA, subtle entrance animations (respect `prefers-reduced-motion`).
5. **Announcement banner.** Read `siteSettings/announcement` (`{enabled, text, linkUrl, linkLabel, updatedAt}`) and show a dismissible banner at the top of the app. Add an admin form in `admin.component` to edit it. Rules already allow public read / admin write.
6. **Journal cards and list** (`journals.component.*`, `common/card`): grid/list toggle, sticky filter bar, skeleton loaders (use the existing `ngx-skeleton-loader`), better empty state, mobile filter bottom sheet.
7. **Issue cover thumbnails.** Generate a first-page image per issue and show it on cards and the home hero. Approach: render page 1 client-side with pdf.js at upload time in the admin (canvas -> JPEG ~400px wide), upload to Storage `journals/covers/{issueId}.jpg`, store `coverUrl` on the journal doc. Add a one-time admin action "Generate missing covers" that backfills existing issues. Add `coverUrl?: string` to `iJournal`. (Storage rules already allow public read, admin write under `journals/`.)
8. **Header/footer.** Cleaner nav, active states, search icon placeholder (wired in Phase 4), sticky header on scroll, improved footer with link groups and ISSN.
9. **Accessibility pass.** Skip link, visible focus rings, `aria-*` on menus/modals/toasts, color contrast >= 4.5:1 in both themes, keyboard-closable modals, `lang` attribute. Update the accessibility statement only with claims that are true.
10. **Mobile pass.** Check 360px and 768px widths on all routes.

**Files likely touched:** `src/styles.scss`, `app.component.*`, `common/header|footer|card`, `home`, `journals`, `admin`, `type/journals.type.ts`, `services/firebase-journal.service.ts`, `public/index.html`.

**Acceptance criteria**
- Light/dark both look correct on every route; toggle persists; no flash of wrong theme on load.
- Banner can be enabled/edited in admin and appears/dismisses on the public site.
- Cards show cover images for all existing issues after backfill; fall back gracefully if missing.
- Lighthouse (mobile) Accessibility >= 95 on `/`, `/journals`; no layout shift from cover images (reserve aspect ratio).
- `prefers-reduced-motion` disables animations.

**Verification:** build, run locally, check with the browser tool at 375/768/1280 widths in both themes; run Lighthouse.

**Out of scope:** article data, search, AI.

**Notes/deviations (done):**
- Palette: calmer navy/blue/green taken from the new IJDR logo (`src/assets/images/logos/`, favicon + touch icons in `public/`). Old purple and gold removed; `.btn-yellow*` classes renamed `.btn-accent*`.
- Tokens: semantic set (`--bg --surface --surface-2 --text --text-muted --border --brand --link --accent-*`) in `src/styles.scss`. The legacy `--primary/secondary/academic-navy/accent-*` scales still exist and auto-invert in dark mode, so unmigrated components follow the theme. New code should use the semantic tokens.
- Dark mode: `ThemeService` + header toggle, `localStorage` key `ijdr-theme`, inline script in `index.html` prevents a flash. PDF viewer/modal chrome is themed (the PDF page itself stays white).
- `common/card` was replaced by `common/issue-card` + `common/issue-cover`. Search icon in the header is a disabled placeholder until Phase 4.
- Covers: `CoverService` renders page 1 with pdf.js at upload; admin has "Generate missing covers". Backfill run on 2026-10-07 (8/8). Storage bucket CORS had to be applied once (see `DEPLOYMENT.md`). Known: the issue PDFs' own cover pages print the old domain `ijdr.co.in`, so the thumbnails show it too. Left as is by decision; fix by replacing the PDFs (or adding a custom-cover upload).
- Announcement: `siteSettings/announcement`, admin tab "Announcement". Not yet exercised against live Firestore (unit-tested only).
- Accessibility: axe-core run on 7 routes x 2 themes: no colour-contrast violations; `/` and `/journals` clean. Remaining moderate `heading-order` findings on /about, /contact, /contribute, /editorial-board (card headings skip levels). Lighthouse itself was not run (no suitable Chrome here). The accessibility statement lists claims (audits, captions, Braille...) that nobody has verified; only true new items were added.
- Tests: the 8 pre-existing failing specs were fixed with Firebase stubs (`src/app/testing/firebase-stubs.ts`); 28 pass. Run with `CHROME_BIN=/opt/ltbrowser/chrome npx ng test --watch=false --browsers=ChromeHeadless` on this machine.
- Removed stray `public/index.html` (Firebase placeholder that shadowed the app in `ng serve`). Fixed `/about` losing its side gutters. `editorial-board.component.scss` still exceeds its 50 kB style budget (warning, pre-existing).

---

## Phase 2 — Content model: articles and admin entry

**Goal:** introduce articles as first-class data, with a manual admin workflow. Phase 3 will automate filling this in; Phase 2 must work fully by hand.

**Prerequisites:** Phase 1 (shared components/tokens).

**Data model** (add to `src/app/type/journals.type.ts`)
```ts
export interface iArticle {
  id: string;
  issueId: string;            // journals/{id}
  title: string;
  authors: { name: string; affiliation?: string; email?: string; orcid?: string }[];
  abstract?: string;
  keywords: string[];
  subject?: string;           // e.g. subject area / JEL code label
  pageStart?: number;         // page in the issue PDF
  pageEnd?: number;
  doi?: string;
  language?: 'en' | 'hi';
  status: 'draft' | 'published';
  source: 'manual' | 'ai';    // provenance
  order: number;              // order within the issue
  // derived/denormalized for listing and search:
  issueVolume: number; issueNumber: number; issueYear: string; issueTitle: string;
  searchTokens?: string[];    // lowercase tokens from title/authors/keywords
  viewCount?: number;
  createdAt?: any; updatedAt?: any;
}
```
Also add `articleCount?: number` and `articlesStatus?: 'none'|'draft'|'published'` to `iJournal`.

**Tasks**
1. Add `ArticleService` (`src/app/services/article.service.ts`): CRUD, `getArticlesByIssue`, `getArticle`, `getRecentArticles`, `searchByToken` stub. Keep `FirebaseJournalService` unchanged except new journal fields.
2. Firestore rules for `articles`: public read only when `status == 'published'`; admin can read/write all. Add index entries to `firestore.indexes.json` (`issueId`+`order`, `status`+`createdAt`, `keywords` array-contains, etc.).
3. Admin UI: a new **Articles** tab in `admin.component` (or split into `admin-articles` component, consistent with `admin-insights`/`admin-messages`): pick an issue, list/reorder/add/edit/delete its articles, authors repeater, keyword chips, page range, publish/unpublish. Reuse `confirm-modal` and `toast` services.
4. Maintain denormalized issue fields and `searchTokens` on save (a small util `utils/article-search.util.ts`). When an issue's title/volume/year is edited, update its articles (batch write).
5. Replace the stub `ArticlesComponent` with a real route-less list component or delete it (decide and note it); do not leave an unused empty component.
6. Unit tests for the token util and the service's pure logic.

**Acceptance criteria**
- An admin can create, edit, reorder, publish, and delete articles for an issue by hand.
- Anonymous users can read only published articles (verified through the rules matrix).
- Issue docs show `articleCount` and status in the admin issue list.
- Builds and tests pass.

**Out of scope:** public article pages (Phase 4), Gemini (Phase 3).

---

## Phase 3 — Gemini ingest pipeline

**Goal:** upload an issue PDF -> get a draft list of articles with metadata -> admin reviews and publishes. This is the highest-leverage AI feature.

**Prerequisites:** Phase 2. User must have a Gemini API key and the Firebase project on the Blaze plan (confirm with the user; if Blaze is unavailable, fall back to a local script that runs the same logic, see task 8).

**Architecture**
- A callable (2nd gen) Cloud Function `ingestIssue({ issueId })`, admin-only (check the `admin` custom claim), `secrets: [GEMINI_API_KEY]`, higher `timeoutSeconds` and memory, one instance at a time per issue.
- Flow: read the issue's PDF from Storage -> send to Gemini (Files API for large PDFs, or inline for small ones) with a strict JSON response schema -> validate -> write `articles` docs with `status: 'draft'`, `source: 'ai'` -> update the issue's `articlesStatus`/`articleCount` and an `ingestJobs/{issueId}` doc (`state`, `error`, `startedAt`, `finishedAt`, `model`).
- Use the model from a constant at the top of the function (check the Gemini docs for the current free-tier model name at implementation time; prefer a Flash-class model). Keep the model name and prompt version in the job doc.
- Structured output via a JSON schema (`responseMimeType: 'application/json'`, `responseSchema`) with fields matching `iArticle`: title, authors[], abstract, keywords[], pageStart, pageEnd, subject.
- Idempotency: re-running ingest replaces only `source: 'ai'` + `status: 'draft'` articles for that issue; never overwrite published or manually edited ones.
- Rate limiting/backoff: retry 429/503 with exponential backoff; surface a clear admin error; one issue at a time.

**Tasks**
1. `functions`: add `@google/genai` (current official SDK), `defineSecret`, the `ingestIssue` function, a prompt file `functions/src/prompts/ingest.ts` (versioned), and schema validation (hand-rolled or `zod`).
2. Prompt engineering notes: instruct Gemini to use the table of contents but verify against the pages; return page numbers as printed in the PDF and note any offset to PDF page index; never invent abstracts, with `abstract: null` when absent; keep original spelling and diacritics; return `confidence` per article.
3. Admin UI: "Extract articles with AI" button on an issue, progress state (listen to `ingestJobs/{issueId}`), then open the review table. Review screen shows PDF page preview next to each draft (use the existing pdf.js pipeline), inline editing, per-article accept/reject, and "Publish all accepted".
4. Rules: `ingestJobs` readable and writable by admin only; Functions write through the Admin SDK.
5. Secrets: `firebase functions:secrets:set GEMINI_API_KEY` (user runs it; Claude must never ask the user to paste the key into chat or a file).
6. Cost/limits guard: refuse PDFs over a size cap, log token usage in the job doc, add a daily ingest counter to avoid blowing the free quota.
7. Tests: unit-test the response validator and idempotency logic with a fixture JSON; manual end-to-end on one real issue.
8. Fallback path: a Node script `functions/scripts/ingestLocal.ts` that runs the same ingest logic from the user's machine with `GEMINI_API_KEY` in the environment and writes drafts via the Admin SDK, for use if Blaze or timeouts are a problem.

**Acceptance criteria**
- Ingesting a real issue produces draft articles with plausible titles/authors/pages; the admin can fix and publish.
- Re-running does not clobber published or hand-edited articles.
- The API key exists only in Secret Manager; a grep of the repo and the built bundle finds no key.
- Errors (quota, bad PDF, timeout) show a readable message in the admin UI.
- Non-admins cannot call the function (verified).

**Out of scope:** public display (Phase 4), reader-facing AI (Phase 5).

**Privacy note to add to the privacy policy in this phase:** only published issues are sent to Gemini; free-tier inputs may be used by Google to improve its models; unpublished manuscripts must never go through this pipeline.

---

## Phase 4 — Discovery: article pages, search, citations, SEO

**Goal:** make the journal's content findable, citable, and indexable.

**Prerequisites:** Phase 2 (data) and ideally Phase 3 (data volume).

**Tasks**
1. **Routes/components:** `/articles` (browse with filters), `/article/:id` (detail), and update `/journal/:id` to list the issue's articles with page links ("Open at page N").
2. **Article detail page:** title, authors/affiliations, abstract, keywords, issue link, "Read PDF at page N" (deep link into the viewer, see Phase 6), view count, share, and **Cite** menu (APA, MLA, Chicago, BibTeX, RIS; copy and download). Cite formatting lives in `utils/citation.util.ts` with unit tests.
3. **Global search** (`⌘K` / `/` shortcut + header search icon): command-palette style overlay using `@angular/cdk` overlay. Query Firestore using `searchTokens` (array-contains-any) for v1, with client-side ranking. Search covers articles, issues, and board members. Debounce, keyboard navigation, recent searches (localStorage, try/catch).
   - If Firestore token search proves too weak, v2 option: embeddings from Phase 5 for semantic search. Do not add a paid search service.
4. **Browse filters:** by year, issue, author, keyword, subject; shareable URL query params.
5. **SEO / indexing:** per-article `<title>`, meta description, canonical, Open Graph, and Google Scholar tags (`citation_title`, `citation_author`, `citation_publication_date`, `citation_journal_title`, `citation_volume`, `citation_issue`, `citation_firstpage`, `citation_pdf_url`, `citation_issn`), plus JSON-LD `ScholarlyArticle`. Extend `route-seo.data.ts` and the existing SEO service logic.
6. **Prerendering:** because article/issue pages are weak for crawlers in a pure SPA, add Angular prerender (or a lightweight Cloud Function that serves meta-tag-complete HTML for bot user agents). Start with prerendering static routes and generating article routes from Firestore at build time, if a build-time list is practical; otherwise the Function approach. Decide and document in this phase.
7. **Sitemap + RSS:** extend the `sitemap` and `rssFeed` functions to include published articles.
8. **Related articles** (non-AI v1): same keywords/subject within the same or other issues.

**Acceptance criteria**
- Every published article has a stable URL, shows full metadata, and cites correctly in all five formats (spot-check against a known reference style).
- Search returns relevant articles for title, author and keyword queries; the overlay is fully keyboard-operable.
- Google's Rich Results / structured data test validates the JSON-LD; Scholar tags present in the served HTML for bots.
- Sitemap contains articles; `/rss.xml` includes new articles.

**Out of scope:** AI summaries, translation, semantic search (Phase 5).

---

## Phase 5 — AI reader features

**Goal:** Gemini-powered features for readers, all cached and rate-limited.

**Prerequisites:** Phases 3 and 4 (needs `articles` with abstracts and the article page). Add App Check here if not yet done.

**Tasks**
1. **App Check** (reCAPTCHA v3 / Enterprise) enabled for the web app and enforced on the new callables. Required before exposing any public AI endpoint.
2. **Plain-language summary + key findings** per article: generated once by an admin-triggered or on-first-request function `summarizeArticle({ articleId })`, stored in `articles/{id}/ai/summary` (`text`, `keyPoints[]`, `model`, `promptVersion`, `generatedAt`). The public page shows a clearly labeled "AI-generated summary" with a disclaimer. Admin can regenerate or hide it.
3. **Hindi (and optional other languages) translation of title/abstract/summary**: `translateArticle({ articleId, lang })`, cached in `articles/{id}/ai/translation_{lang}`; language switch on the article page. Add `lang` handling to the page, not site-wide i18n.
4. **Embeddings and related articles:** compute embeddings per article (title + abstract + keywords) with the Gemini embedding model, stored in `articles/{id}/ai/embedding` (or a single `embeddings` doc to keep reads small). "Related articles" uses cosine similarity (computed in a function or client-side on a small corpus). Optional semantic search mode in the Phase 4 overlay via a `semanticSearch` callable.
5. **"Ask this paper"** chat on the article page: `askPaper({ articleId, question })` grounded in the article's text range from the PDF (use the stored page range; extract text server-side with `pdfjs-dist` or send the PDF slice). Answers must cite page numbers; refuse questions it cannot answer from the text. Strict per-user/IP rate limit (Firestore counter or App Check token + simple limiter) and a hard daily cap, with a friendly "limit reached" message.
6. **Guardrails:** prompt-injection hardening (treat PDF text as data), output length caps, no chat history stored with PII, a visible "AI can make mistakes" notice, and an admin kill switch in `siteSettings/ai` (`{summaries, translation, chat, semanticSearch}` booleans) read by both the UI and the functions.
7. Update the privacy policy and terms with an AI-features section (what is sent to Google, what is stored).

**Acceptance criteria**
- Summaries/translations are generated once, cached, and served from Firestore on later views (verify no Gemini call on the second view).
- The chat refuses off-topic or unanswerable questions and cites pages; the rate limit works.
- Kill switches immediately hide features and make functions reject calls.
- No key exposure; App Check is enforced on the callables.
- Free-tier quota usage is logged and a daily cap exists.

**Out of scope:** user accounts, saved chats, paid models.

---

## Phase 6 — Reader experience: PDF viewer, PWA, performance

**Goal:** a faster, nicer reading experience and installability.

**Prerequisites:** Phase 4 (deep links to pages). Can be done before Phase 5 if preferred, since it does not depend on AI.

**Tasks**
1. **PDF viewer upgrades** (`pdf-viewer.component.*`, `pdf-modal`): thumbnail sidebar, in-document text search with highlights, page-jump input, fit-width/fit-page, keyboard shortcuts (arrows, +/-, `/` to search), remember last page per issue (localStorage), `?page=N` deep link, article outline sidebar from Phase 2 data, dark-theme-aware chrome, download button with the neutral filename. Consolidate duplication between `pdf-viewer` and the 947-line `pdf-modal` into shared logic where practical.
2. **PWA:** web manifest, icons, `@angular/service-worker` (cache app shell and static assets; do not cache PDFs by default; optional "save for offline" later), update-available toast.
3. **Performance:** lazy-load route components (`loadComponent`) so the initial bundle excludes admin and pdf.js; load pdf.js only on viewer routes; image `loading="lazy"` and sized covers; font-display swap and subset Google Fonts; check bundle budgets in `angular.json`; preconnect hints.
4. **Security headers** (from the roadmap): Content-Security-Policy (report-only first), Referrer-Policy, Permissions-Policy in `firebase.json`; verify GA, Firebase, Google Fonts and pdf.js worker still work.
5. **Analytics events:** `journal_open`, `pdf_view`, `article_view`, `search`, `cite_copy`, `ai_summary_view` (no PII).

**Acceptance criteria**
- Lighthouse mobile: Performance >= 85, PWA installable, Best Practices >= 95 on `/` and `/journals`.
- Initial JS bundle measurably smaller than before (record before/after numbers in the PR/commit).
- Viewer search, thumbnails, deep links and remembered pages work on desktop and mobile.
- CSP in report-only produces no violations on the main flows before it is enforced.

---

## Phase 7 — Admin dashboard, analytics, submissions

**Goal:** give editors better tooling and close the loop with authors.

**Prerequisites:** Phases 2-4 for article-level stats; Phase 5 for the AI triage items.

**Tasks**
1. **Stats rollup:** scheduled function `scheduledStatsRollup` writes `stats/daily/{yyyy-mm-dd}` (views per issue/article, searches, contact count). Admin Insights gets sparklines and top-content charts (use a lightweight chart lib or plain SVG; follow the existing `admin-insights` structure).
2. **Contact inbox:** status (new/handled), search/filter, and an optional Gemini triage: category + suggested reply draft (admin-only, never auto-sent). Optional `onContactCreated` email notification only if the user accepts an email provider (secret in Secret Manager); otherwise skip.
3. **Manuscript submission flow** (replaces "email us" on `/contribute`): a form with author details, title, abstract, files upload to a private Storage path (`submissions/{id}/...`, writable only via a signed or function-mediated upload; not publicly readable), size/type validation, rules + App Check. Admin gets a **Submissions** tab with status workflow (received, under review, revision, accepted, rejected) and notes.
4. **Optional Gemini pre-check** for submissions: format and abstract length against the guidelines, reference style hints. Only if the user opts in, since unpublished manuscripts would go to a free-tier API that may use inputs for training. Default to off, with explicit privacy wording.
5. **Audit log** for admin actions (publish/unpublish/delete) in `auditLog` (admin read-only).
6. **Ops:** emulator-based rules tests in CI (`@firebase/rules-unit-testing`), GCP billing alert checklist, document in `DEPLOYMENT.md`.

**Acceptance criteria**
- Admin Insights shows daily trends from rollups.
- A submitted manuscript is stored privately, visible only to admins, with a working status workflow.
- Rules tests run in CI and cover each collection for anonymous / non-admin / admin.
- Contact triage (if enabled) never sends anything automatically.

---

## Cross-phase checklists

**Definition of done for each phase**
- [ ] Acceptance criteria met and demoed in the browser (desktop + mobile, light + dark where relevant)
- [ ] `npm run build` and `npm test` pass; functions build (`npm run build` in `functions/`)
- [ ] Rules/indexes updated and tested
- [ ] No secrets in repo or bundle
- [ ] This doc's Status table updated, with a short "Notes/deviations" line under the phase
- [ ] Deployed only after the user's approval

**Deployment order when a phase touches several layers:** indexes -> rules -> functions -> hosting.

**Open questions to confirm with the user before the relevant phase**
- Phase 0: OK to untrack large binaries and the key file? Rewrite history or just rotate?
- Phase 1: any brand colors/logo constraints? Keep the purple, or move to a calmer palette?
- Phase 3: Is the Firebase project on Blaze? Which Gemini model is available on the user's key?
- Phase 4: Prerender at build time vs bot-only function?
- Phase 5: Which languages besides Hindi? Is a public chat acceptable under the free quota?
- Phase 7: Is an email provider acceptable? Are AI pre-checks allowed on unpublished manuscripts (default: no)?
