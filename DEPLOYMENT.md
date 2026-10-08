# IJDR deployment guide

This document is the **source of truth** for how the Indian Journal of Development Research (IJDR) stack is built and shipped. Follow it for manual deploys and when automating (CI) or handing work to another developer or assistant.

---

## What runs where

| Surface | Role | How it is deployed |
|--------|------|---------------------|
| **Public website** (e.g. ijdrpub.in) | Angular SPA (`journal-portal`) | **Firebase Hosting** (primary) |
| **Optional self-hosted stack** | Same Angular app behind **nginx** + Django **backend** | **Docker Compose** at repo root |
| **Data / auth for the portal** | Firestore, Storage, Firebase Auth | Firebase Console (rules/indexes), not this file |

The Angular app reads journal and board data from **Firebase** (Firestore / Storage). The Django API in this repo is a **separate** backend; the live public portal does not need it for the main journal browsing flow unless you intentionally proxy features through it.

---

## Prerequisites

- **Node.js 20+** (matches CI-style setups; project uses Angular 19).
- **Firebase CLI**: `npm install -g firebase-tools` (or use `npx firebase`).
- For Docker path: **Docker** and **Docker Compose v2**.
- For Django backend: `journal_backend/.env` (see backend docs or `.env.example` if present).

---

## 1. Firebase Hosting (production public site)

**Config files** (under `journal-portal/`):

- [journal-portal/.firebaserc](journal-portal/.firebaserc) — default Firebase project id.
- [journal-portal/firebase.json](journal-portal/firebase.json) — Hosting `public` folder, rewrites, cache headers.

**Important values:**

- **Project id:** `ijdr-e41d4` (`.firebaserc` → `default`).
- **Hosting site id:** `ijdr-e41d4` (`firebase.json` → `hosting.site`). If Firebase Console shows a different **site ID** under Hosting, update `site` to match or deploys will fail.
- **Built files uploaded:** `journal-portal/dist/journal-portal/browser/` (Angular application builder output).

### Deploy steps (every release)

```bash
cd journal-portal
npm ci
npm run build -- --configuration=production
firebase login          # if not already authenticated (or use CI token below)
firebase deploy --only hosting
```

**First-time or expired auth:** run `firebase login` and complete the browser flow. For automation, use `firebase login:ci`, store the token securely, then:

```bash
firebase deploy --only hosting --non-interactive --token "$FIREBASE_TOKEN"
```

### Hosting cache behavior (why hard refresh matters less now)

- **`/index.html`** is sent with `Cache-Control: no-cache, no-store, must-revalidate` so clients fetch a fresh shell after deploy.
- **`*.js` / `*.css`** use long immutable caching; filenames are content-hashed, so new builds get new URLs.

### Optional: other Firebase resources

Only when you change those parts of the project:

```bash
cd journal-portal
firebase deploy --only functions   # Cloud Functions (e.g. PDF-related rewrites)
firebase deploy --only firestore   # rules + indexes
firebase deploy --only storage     # Storage rules
```

---

## 2. Docker + nginx (self-hosted or staging)

**Purpose:** Run the same built Angular files from `nginx` plus the Django app from `journal_backend` (GraphQL, admin API, static files, etc.).

**Key files:**

- [docker-compose.yml](docker-compose.yml) — services `backend`, `nginx`.
- [Dockerfile.frontend](Dockerfile.frontend) — copies `journal-portal/dist/journal-portal/browser` into nginx image.
- [nginx/default.conf](nginx/default.conf) — SPA fallback, proxy to backend for `/graphql/`, `/django-admin/`, `/static/`.

### Build frontend, then build images

```bash
# From repository root
cd journal-portal
npm ci
npm run build -- --configuration=production
cd ..

docker compose build
docker compose up -d
```

**Backend:** ensure `journal_backend/.env` exists. After model changes:

```bash
docker compose exec backend python manage.py migrate
```

(Adjust if your compose service name or entrypoint differs.)

**Nginx note:** `default.conf` is bind-mounted in compose, so config changes apply on **container recreate** without rebuilding the frontend image. **HTML/JS/CSS** changes require a **new Angular build** and **nginx image rebuild** (or rebuild the `nginx` service) because assets are baked into the image.

---

## 3. Git and GitHub

- **Remote:** `origin` → GitHub repo for this monorepo.
- **Default branch:** `main`.
- **Workflow:** commit → push to `main`; then run **Firebase** and/or **Docker** deploy as above.

**GitHub Actions:** workflow files under [journal-portal/.github/workflows/](journal-portal/.github/workflows/) exist for Firebase and Docker-style deploys. GitHub only runs workflows from the repository **root** `.github/workflows/` unless you symlink or copy them—if CI does not run on push, that is the first place to check.

---

## 4. Angular production build

Always use the **production** configuration so `environment.prod.ts` and optimizations apply:

```bash
cd journal-portal
npm run build -- --configuration=production
```

Output directory: `journal-portal/dist/journal-portal/browser/`.

---

## 5. Troubleshooting

| Symptom | Things to check |
|--------|------------------|
| Old UI after deploy | Confirm Hosting deploy succeeded; check Network tab for new `main-*.js` hash; `index.html` should not be cached long-term (Firebase headers above). |
| `firebase deploy` auth errors | `firebase login` or valid `FIREBASE_TOKEN`. |
| `Assertion failed: … site name` | `firebase.json` → `hosting.site` must match the Hosting **site ID** in Firebase Console. |
| Docker nginx shows old UI | Rebuild after `ng build`; restart containers. |
| CORS / PDF issues in browser | Often Storage CORS or token URLs; see app code and Firebase Storage rules—not deploy script alone. |

---

### Storage CORS (needed for admin cover generation)

The admin "Generate missing covers" action reads issue PDFs from the browser, which requires the Storage bucket to send CORS headers. This is a one-time bucket setting (not part of `firebase deploy`). The config is `journal-portal/cors.json`; apply it from Google Cloud Shell (or any machine with a working `gcloud`):

```bash
# paste the contents of journal-portal/cors.json into cors.json first
gcloud storage buckets update gs://ijdr-e41d4.firebasestorage.app --cors-file=cors.json
gcloud storage buckets describe gs://ijdr-e41d4.firebasestorage.app --format="default(cors_config)"
```

Re-apply after adding a new site origin to `cors.json`.

## Secrets

Never commit credentials. `firebase-config.ts` (web config), `.env*`, service-account JSON and `firebase_key.json` are gitignored.

**Gemini API key (used from Phase 3 on).** Gemini is called only from Cloud Functions; the key lives in Secret Manager and is never in the browser bundle or git. Set it yourself in a terminal (do not paste it into chat or a file):

```bash
cd journal-portal
firebase functions:secrets:set GEMINI_API_KEY   # prompts for the value
firebase functions:secrets:access GEMINI_API_KEY  # verify it exists (prints the value; don't share)
```

**Ingest function (Phase 3).** `ingestIssue` is a callable 2nd-gen function (admin claim required, 540 s, 1 GiB, max 3 instances). Deploy order: `firebase deploy --only firestore:indexes`, then `firestore:rules`, then `functions:ingestIssue`, then hosting. The model defaults to `gemini-3.5-flash` (`DEFAULT_GEMINI_MODEL` in `functions/src/ingest/run.ts`); override with a `GEMINI_MODEL` env var (e.g. `functions/.env.ijdr-e41d4`). It is capped at 10 extractions per UTC day (`ingestStats/{date}`) and PDFs over 100 MB are refused. Offline fallback: `functions/scripts/ingestLocal.js` (see its header).

Functions declare it with `defineSecret('GEMINI_API_KEY')` and `secrets: [GEMINI_API_KEY]`. Secret Manager requires the Blaze plan. For local runs, export `GEMINI_API_KEY` in your shell only.

**App Check (Phase 5).** The public AI callables (`summarizeArticle`, `translateArticle`, `askPaper`, `semanticSearch`) use `enforceAppCheck: true`; without App Check they reject every call, and the site hides the features. One-time setup, in the browser (not something to paste into chat):

1. Google reCAPTCHA admin (https://www.google.com/recaptcha/admin) -> create a **reCAPTCHA v3** site for `ijdrpub.in` (add `localhost` for development). Keep the **secret key** to yourself.
2. Firebase Console -> App Check -> Apps -> your web app -> **reCAPTCHA** -> paste the **secret key**, save.
3. Put the **site key** (public) in `recaptchaSiteKey` in `src/environments/environment.ts`, `environment.development.ts` and `environment.prod.ts`, then rebuild/redeploy hosting.
4. For `ng serve`: the dev build prints an App Check *debug token* in the browser console; register it under App Check -> Apps -> Manage debug tokens.
5. Only after the site works with App Check, switch the features on in Admin -> **AI**. Pre-generate summaries/translations from each article's editor so readers get cached results.

**Email notifications (Phase 7, Resend).** `submitManuscript` and `onContactCreated` email the editorial office through Resend; nothing is sent unless `NOTIFY_EMAIL_TO` is set. Setup:

1. Create a Resend account and an API key. Store it as a secret (prompts for the value; do not paste it into chat or a file): `firebase functions:secrets:set RESEND_API_KEY` (**the secret must exist before the functions deploy**, even if you leave notifications off; you can store a placeholder and replace it later).
2. In `journal-portal/functions/.env` (gitignored) add `NOTIFY_EMAIL_TO=you@example.org` and, once you have verified a sending domain in Resend, `NOTIFY_EMAIL_FROM=IJDR <noreply@your-domain>`. Until then the default sender `onboarding@resend.dev` only delivers to the email address of your own Resend account.
3. Notifications are best effort: a Resend failure never blocks a submission or a contact message.

**If a key leaks:** rotate it in Google Cloud Console (IAM -> Service Accounts -> Keys, or Secret Manager), then update the secret and redeploy functions.

---

## Operations (Phase 7)

**Scheduled stats.** `scheduledStatsRollup` runs daily at 00:10 UTC (Cloud Scheduler is enabled automatically on the first deploy) and writes `statsDaily/{yyyy-mm-dd}`. Admin -> Insights has a "Take a snapshot now" button for the first data point; trends need two days of snapshots.

**Rules tests and CI.** `npm run test:rules` (in `journal-portal`) starts the Firestore and Storage emulators (needs Java) and checks every collection and storage path for anonymous, signed-in non-admin and admin users. `.github/workflows/ci.yml` runs the app build and unit tests, the functions tests and the rules tests on every push and pull request. Keep the tests in step with `firestore.rules` and `storage.rules`.

**Billing alert checklist (Blaze plan).**
- [ ] Google Cloud Console -> Billing -> Budgets & alerts: create a monthly budget (e.g. USD 5) with alerts at 50%, 90% and 100%, sent to at least two people.
- [ ] Optional: connect the budget to Pub/Sub to disable billing automatically if exceeded (understand that this takes the site offline).
- [ ] Check Firebase Console -> Usage monthly: Firestore reads, Storage egress, Functions invocations.
- [ ] Gemini free-tier quota and the in-app daily caps (`functions/src/ai/service.ts`, `ingest/run.ts`) are the guard against AI cost; review them if you move to a paid Gemini plan.
- [ ] In Firebase Console -> App Check, review request metrics before considering enforcement for Firestore and Storage.

## 6. Quick checklist (copy before a release)

- [ ] `git pull` on the machine doing the deploy.
- [ ] `journal-portal`: `npm ci` → `npm run build -- --configuration=production`.
- [ ] **Firebase:** `firebase deploy --only hosting` from `journal-portal/`.
- [ ] (If using Docker) from repo root: `docker compose up -d --build` and `migrate` if needed.
- [ ] Smoke-test: home, journals, deep link `/journal/:id`, footer year, login/admin if used.

---

## 7. Updating this document

When you add environments (staging domain), change Firebase project/site, or switch primary hosting from Firebase to Docker-only, **edit this file in the same PR** so deploy instructions stay accurate.
