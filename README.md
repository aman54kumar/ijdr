# IJDR — Indian Journal of Development Research

Monorepo for the IJDR public journal portal, optional Django API, and deployment assets.

| Path | Description |
|------|-------------|
| [**journal-portal/**](./journal-portal/) | **Primary public site** — Angular 19 SPA on Firebase (Firestore, Storage, Auth, Hosting, Cloud Functions). Start here for frontend and Firebase config. |
| [**journal_backend/**](./journal_backend/) | Optional Django / GraphQL backend — not required for the main Firebase-only browsing and admin flow. |
| [**DEPLOYMENT.md**](./DEPLOYMENT.md) | How production is built and deployed (Firebase Hosting, optional Docker + nginx). |
| [**nginx/**](./nginx/) | Sample nginx config when self-hosting the stack. |

**Live site:** [ijdrpub.in](https://ijdrpub.in/)

## Quick start (portal only)

```bash
cd journal-portal
npm ci
npm start
```

## Deploy

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Firebase Hosting, Functions, rules, and Docker workflows.

## Roadmap

Open items and ops checklists for the portal: [journal-portal/IMPROVEMENTS-ROADMAP.md](./journal-portal/IMPROVEMENTS-ROADMAP.md).
