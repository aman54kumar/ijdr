# IJDR Journal Portal

Public website and admin tooling for the **Indian Journal of Development Research** ([ijdrpub.in](https://ijdrpub.in/)): browse issues, open PDFs, contact the journal, and manage content with Firebase-backed auth and storage.

## Stack

- **Framework:** Angular 19 (standalone components, application builder)
- **UI:** Bootstrap 5, Bootstrap Icons, SCSS
- **Backend:** Firebase (Authentication, Firestore, Storage, Hosting)
- **Cloud Functions (TypeScript):** PDF proxy (`getPdf`), dynamic `sitemap.xml`, `rss.xml`
- **PDF:** PDF.js in-modal; full-issue page uses iframe streaming where appropriate

## Repository layout

```text
journal-portal/
├── src/app/           # Components, routes, guards, services
├── public/            # Static assets copied to build (e.g. robots.txt)
├── functions/         # Firebase Cloud Functions (src + compiled lib)
├── firebase.json      # Hosting rewrites, headers, Firestore/Storage config
├── firestore.rules    # Least-privilege Firestore rules
├── storage.rules      # Scoped Storage rules (journals/, boardMembers/)
└── angular.json       # Build; pdf.worker from pdfjs-dist
```

## Prerequisites

- **Node.js 20+** (recommended; matches deployment docs)
- **npm** 9+
- **Firebase CLI** for deploys (`npm install -g firebase-tools` or `npx firebase`)

## Local development

```bash
cd journal-portal
npm ci
npm start
```

Open the URL shown by the CLI (typically `http://localhost:4200`).

Firebase features need valid environment config in `src/environments/` (project id, keys). Do not commit secrets; use local overrides or CI secrets for production keys.

## Production build

```bash
npm run build -- --configuration=production
```

Output: `dist/journal-portal/browser/` (Firebase Hosting `public` target in `firebase.json`).

## Deploy

Repo-level steps, Hosting cache behavior, and Docker/nginx options are documented in [**DEPLOYMENT.md**](../DEPLOYMENT.md) at the repository root.

Typical Firebase deploy from this folder:

```bash
firebase deploy --only hosting
firebase deploy --only functions    # when Functions change
firebase deploy --only firestore    # rules + indexes
firebase deploy --only storage      # Storage rules
```

## Admin access

- Sign-in: `/login` (Firebase Auth).
- **Admin** actions require the Firebase Auth custom claim `admin: true`. A one-off script lives under `functions/scripts/setAdminClaim.js` (run with service account credentials; see script header).

## Features (high level)

- Public journals listing with search, year filter, sort (newest / most viewed), skeleton loading
- Issue detail and PDF viewing; per-issue `viewCount` with session deduplication
- Editorial and advisory boards; legal pages
- Contact form → Firestore `contactSubmissions`; **Admin → Messages** inbox
- **Admin → Insights:** issues by `viewCount` with links to Google Analytics and Firebase Console
- SEO: `robots.txt`, sitemap, canonical and Open Graph / Twitter tags on issue pages
- Analytics: AngularFire Analytics (SPA `page_view`), Performance Monitoring bootstrap

## Security model (summary)

- Firestore: public read where needed; writes restricted by `request.auth.token.admin` (and validated anonymous **create** for contact submissions).
- Storage: reads for journal/board paths as required by the app; writes/deletes admin-only.
- See `firestore.rules` and `storage.rules` for the exact policy.

## Further reading

| Document | Purpose |
|----------|---------|
| [IMPROVEMENTS-ROADMAP.md](./IMPROVEMENTS-ROADMAP.md) | **Remaining** optional work and ops tasks |
| [DEPLOYMENT.md](../DEPLOYMENT.md) | Hosting, Docker, Firebase deploy |
| [FIREBASE_PDF_SOLUTION.md](./FIREBASE_PDF_SOLUTION.md) | PDF hosting and proxy notes |
| [CUSTOM_DOMAIN_SETUP.md](./CUSTOM_DOMAIN_SETUP.md) | Domain / Firebase Hosting |

## License

Proprietary. All rights reserved unless otherwise agreed in writing.
