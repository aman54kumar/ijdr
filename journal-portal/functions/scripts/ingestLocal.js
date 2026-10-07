#!/usr/bin/env node
/**
 * Run the same ingest as the `ingestIssue` function from your own machine.
 *
 *   cd functions && npm run build
 *   export GEMINI_API_KEY=...            # in your shell only
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *   node scripts/ingestLocal.js <issueId> [--project ijdr-e41d4] [--bucket <bucket>]
 *
 * Writes draft articles with the Admin SDK (bypasses rules), so use a credential you trust.
 */
const admin = require('firebase-admin');
const { runIngest } = require('../lib/ingest/run');

const args = process.argv.slice(2);
const issueId = args.find((a) => !a.startsWith('--'));
const flag = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const apiKey = process.env.GEMINI_API_KEY;
if (!issueId || !apiKey) {
  console.error('Usage: GEMINI_API_KEY=... node scripts/ingestLocal.js <issueId> [--project id] [--bucket name]');
  process.exit(1);
}
const projectId = flag('project') || process.env.GCLOUD_PROJECT || 'ijdr-e41d4';
admin.initializeApp({ projectId, storageBucket: flag('bucket') || `${projectId}.firebasestorage.app` });

runIngest({
  db: admin.firestore(),
  bucket: admin.storage().bucket(),
  apiKey,
  issueId,
  model: process.env.GEMINI_MODEL,
})
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
