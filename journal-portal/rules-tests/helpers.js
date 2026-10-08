const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');

const root = path.join(__dirname, '..');

async function makeEnv(extra = {}) {
  return initializeTestEnvironment({
    projectId: 'demo-ijdr',
    firestore: { rules: fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: fs.readFileSync(path.join(root, 'storage.rules'), 'utf8'), host: '127.0.0.1', port: 9199 },
    ...extra,
  });
}

/** The three audiences every rule is checked for. */
function contexts(env) {
  return {
    anon: env.unauthenticatedContext(),
    user: env.authenticatedContext('user1', { email: 'user@example.com' }),
    admin: env.authenticatedContext('admin1', { admin: true, email: 'admin@example.com' }),
  };
}

module.exports = { makeEnv, contexts };
