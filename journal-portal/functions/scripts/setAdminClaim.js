/**
 * Grant Firebase Auth custom claim { admin: true } so Firestore/Storage rules allow writes.
 *
 * Prerequisites: Firebase Admin credentials (e.g. set GOOGLE_APPLICATION_CREDENTIALS to a
 * service account key JSON with "Firebase Authentication Admin" / Editor on the project).
 *
 * Usage (from journal-portal/functions):
 *   node scripts/setAdminClaim.js <USER_UID>
 *
 * Find UID: Firebase Console → Authentication → Users.
 */
const admin = require('firebase-admin');

const uid = process.argv[2];
if (!uid) {
  console.error('Usage: node scripts/setAdminClaim.js <USER_UID>');
  process.exit(1);
}

admin.initializeApp();

admin
  .auth()
  .setCustomUserClaims(uid, { admin: true })
  .then(() => {
    console.log('Custom claim admin:true set for', uid);
    console.log('Ask the user to sign out and sign in again (or wait for token refresh).');
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
