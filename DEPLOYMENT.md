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

## 6. Quick checklist (copy before a release)

- [ ] `git pull` on the machine doing the deploy.
- [ ] `journal-portal`: `npm ci` → `npm run build -- --configuration=production`.
- [ ] **Firebase:** `firebase deploy --only hosting` from `journal-portal/`.
- [ ] (If using Docker) from repo root: `docker compose up -d --build` and `migrate` if needed.
- [ ] Smoke-test: home, journals, deep link `/journal/:id`, footer year, login/admin if used.

---

## 7. Updating this document

When you add environments (staging domain), change Firebase project/site, or switch primary hosting from Firebase to Docker-only, **edit this file in the same PR** so deploy instructions stay accurate.
