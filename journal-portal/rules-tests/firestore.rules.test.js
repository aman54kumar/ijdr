// Run with: npm run test:rules   (starts the Firestore + Storage emulators)
const { test, before, after, beforeEach } = require('node:test');
const { assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, increment, Timestamp } = require('firebase/firestore');
const { makeEnv, contexts } = require('./helpers');

let env;
let dbs;

before(async () => {
  env = await makeEnv();
});
after(async () => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'journals/j1'), { title: 'J', viewCount: 1 });
    await setDoc(doc(db, 'articles/pub'), { title: 'P', status: 'published', viewCount: 2, keywords: ['a'], issueId: 'j1' });
    await setDoc(doc(db, 'articles/dr'), { title: 'D', status: 'draft', issueId: 'j1' });
    for (const a of ['pub', 'dr']) for (const d of ['summary', 'related', 'embedding']) await setDoc(doc(db, `articles/${a}/ai/${d}`), { x: 1 });
    await setDoc(doc(db, 'boardMembers/b1'), { name: 'B' });
    await setDoc(doc(db, 'admins/user1'), { x: 1 });
    await setDoc(doc(db, 'admins/other'), { x: 1 });
    await setDoc(doc(db, 'contactSubmissions/c1'), { name: 'N', email: 'n@x.co', message: 'm', read: false });
    await setDoc(doc(db, 'siteSettings/ai'), { chat: true });
    await setDoc(doc(db, 'adminSettings/notifications'), { emails: ['a@x.co'] });
    await setDoc(doc(db, 'ingestJobs/j1'), { state: 'done' });
    await setDoc(doc(db, 'ingestStats/2026-10-07'), { count: 1 });
    await setDoc(doc(db, 'aiStats/2026-10-07'), { chat: 1 });
    await setDoc(doc(db, 'submissions/s1'), { title: 'S', status: 'received' });
    await setDoc(doc(db, 'auditLog/a1'), { action: 'x', actorUid: 'admin1' });
    await setDoc(doc(db, 'statsDaily/2026-10-07'), { date: '2026-10-07' });
  });
  const c = contexts(env);
  dbs = { anon: c.anon.firestore(), user: c.user.firestore(), admin: c.admin.firestore() };
});

const validContact = () => ({ name: 'N', email: 'n@x.co', message: 'hello', read: false, createdAt: Timestamp.now() });

test('journals: public read, admin write, public +1 view only', async () => {
  for (const who of ['anon', 'user', 'admin']) await assertSucceeds(getDoc(doc(dbs[who], 'journals/j1')));
  for (const who of ['anon', 'user']) {
    await assertFails(setDoc(doc(dbs[who], 'journals/new'), { title: 'x' }));
    await assertFails(deleteDoc(doc(dbs[who], 'journals/j1')));
    await assertFails(updateDoc(doc(dbs[who], 'journals/j1'), { title: 'hack' }));
    await assertFails(updateDoc(doc(dbs[who], 'journals/j1'), { viewCount: increment(5), updatedAt: Timestamp.now() }));
    await assertSucceeds(updateDoc(doc(dbs[who], 'journals/j1'), { viewCount: increment(1), updatedAt: Timestamp.now() }));
  }
  await assertSucceeds(setDoc(doc(dbs.admin, 'journals/new'), { title: 'x' }));
  await assertSucceeds(deleteDoc(doc(dbs.admin, 'journals/new')));
});

test('articles: published only for the public; admin everything; +1 view', async () => {
  for (const who of ['anon', 'user']) {
    await assertSucceeds(getDoc(doc(dbs[who], 'articles/pub')));
    await assertFails(getDoc(doc(dbs[who], 'articles/dr')));
    await assertSucceeds(getDocs(query(collection(dbs[who], 'articles'), where('status', '==', 'published'))));
    await assertFails(getDocs(collection(dbs[who], 'articles')));
    await assertFails(setDoc(doc(dbs[who], 'articles/x'), { title: 'T', status: 'draft' }));
    await assertFails(updateDoc(doc(dbs[who], 'articles/pub'), { title: 'Z' }));
    await assertFails(deleteDoc(doc(dbs[who], 'articles/pub')));
    await assertSucceeds(updateDoc(doc(dbs[who], 'articles/pub'), { viewCount: increment(1) }));
    await assertFails(updateDoc(doc(dbs[who], 'articles/pub'), { viewCount: increment(1), title: 'X' }));
    await assertFails(updateDoc(doc(dbs[who], 'articles/dr'), { viewCount: increment(1) }));
  }
  await assertSucceeds(getDoc(doc(dbs.admin, 'articles/dr')));
  await assertSucceeds(setDoc(doc(dbs.admin, 'articles/x'), { title: 'T', status: 'draft' }));
  await assertFails(setDoc(doc(dbs.admin, 'articles/y'), { title: 'T', status: 'weird' }));
  await assertFails(setDoc(doc(dbs.admin, 'articles/y'), { title: '', status: 'draft' }));
  await assertSucceeds(deleteDoc(doc(dbs.admin, 'articles/x')));
});

test('articles/{id}/ai: public reads cache of published articles only; embeddings admin-only', async () => {
  for (const who of ['anon', 'user']) {
    await assertSucceeds(getDoc(doc(dbs[who], 'articles/pub/ai/summary')));
    await assertSucceeds(getDoc(doc(dbs[who], 'articles/pub/ai/related')));
    await assertFails(getDoc(doc(dbs[who], 'articles/pub/ai/embedding')));
    await assertFails(getDoc(doc(dbs[who], 'articles/dr/ai/summary')));
    await assertFails(setDoc(doc(dbs[who], 'articles/pub/ai/summary'), { hidden: true }, { merge: true }));
  }
  await assertSucceeds(getDoc(doc(dbs.admin, 'articles/dr/ai/summary')));
  await assertSucceeds(getDoc(doc(dbs.admin, 'articles/pub/ai/embedding')));
  await assertSucceeds(setDoc(doc(dbs.admin, 'articles/pub/ai/summary'), { hidden: true }, { merge: true }));
});

test('boardMembers: public read, admin write', async () => {
  for (const who of ['anon', 'user', 'admin']) await assertSucceeds(getDoc(doc(dbs[who], 'boardMembers/b1')));
  for (const who of ['anon', 'user']) {
    await assertFails(setDoc(doc(dbs[who], 'boardMembers/b2'), { name: 'x' }));
    await assertFails(updateDoc(doc(dbs[who], 'boardMembers/b1'), { name: 'x' }));
    await assertFails(deleteDoc(doc(dbs[who], 'boardMembers/b1')));
  }
  await assertSucceeds(setDoc(doc(dbs.admin, 'boardMembers/b2'), { name: 'x' }));
});

test('admins: a user reads only their own doc; nobody writes', async () => {
  await assertSucceeds(getDoc(doc(dbs.user, 'admins/user1')));
  await assertFails(getDoc(doc(dbs.user, 'admins/other')));
  await assertFails(getDoc(doc(dbs.anon, 'admins/user1')));
  for (const who of ['anon', 'user', 'admin']) await assertFails(setDoc(doc(dbs[who], 'admins/user1'), { x: 2 }));
});

test('contactSubmissions: public create (validated); admin read/update/delete', async () => {
  for (const who of ['anon', 'user', 'admin']) await assertSucceeds(setDoc(doc(dbs[who], `contactSubmissions/n-${who}`), validContact()));
  for (const who of ['anon', 'user']) {
    await assertFails(getDoc(doc(dbs[who], 'contactSubmissions/c1')));
    await assertFails(updateDoc(doc(dbs[who], 'contactSubmissions/c1'), { read: true }));
    await assertFails(deleteDoc(doc(dbs[who], 'contactSubmissions/c1')));
  }
  await assertFails(setDoc(doc(dbs.anon, 'contactSubmissions/bad1'), { ...validContact(), email: 'nope' }));
  await assertFails(setDoc(doc(dbs.anon, 'contactSubmissions/bad2'), { ...validContact(), read: true }));
  await assertFails(setDoc(doc(dbs.anon, 'contactSubmissions/bad3'), { ...validContact(), message: '' }));
  await assertSucceeds(getDoc(doc(dbs.admin, 'contactSubmissions/c1')));
  await assertSucceeds(updateDoc(doc(dbs.admin, 'contactSubmissions/c1'), { status: 'handled', read: true }));
});

test('siteSettings: public read, admin write', async () => {
  for (const who of ['anon', 'user', 'admin']) await assertSucceeds(getDoc(doc(dbs[who], 'siteSettings/ai')));
  for (const who of ['anon', 'user']) await assertFails(setDoc(doc(dbs[who], 'siteSettings/ai'), { chat: false }));
  await assertSucceeds(setDoc(doc(dbs.admin, 'siteSettings/ai'), { chat: false }));
});

test('admin-only collections: ingestJobs, ingestStats, adminSettings', async () => {
  for (const path of ['ingestJobs/j1', 'ingestStats/2026-10-07', 'adminSettings/notifications']) {
    for (const who of ['anon', 'user']) {
      await assertFails(getDoc(doc(dbs[who], path)));
      await assertFails(setDoc(doc(dbs[who], path), { a: 1 }));
    }
    await assertSucceeds(getDoc(doc(dbs.admin, path)));
    await assertSucceeds(setDoc(doc(dbs.admin, path), { a: 1 }));
  }
});

test('read-only for admins, hidden from the public: aiStats, statsDaily', async () => {
  for (const path of ['aiStats/2026-10-07', 'statsDaily/2026-10-07']) {
    for (const who of ['anon', 'user']) await assertFails(getDoc(doc(dbs[who], path)));
    await assertSucceeds(getDoc(doc(dbs.admin, path)));
    for (const who of ['anon', 'user', 'admin']) await assertFails(setDoc(doc(dbs[who], path), { a: 1 }));
  }
});

test('submissions: admin read and update; nobody creates or deletes from a client', async () => {
  for (const who of ['anon', 'user']) {
    await assertFails(getDoc(doc(dbs[who], 'submissions/s1')));
    await assertFails(setDoc(doc(dbs[who], 'submissions/new'), { title: 'x' }));
    await assertFails(updateDoc(doc(dbs[who], 'submissions/s1'), { status: 'accepted' }));
  }
  await assertSucceeds(getDoc(doc(dbs.admin, 'submissions/s1')));
  await assertSucceeds(updateDoc(doc(dbs.admin, 'submissions/s1'), { status: 'under_review' }));
  await assertFails(setDoc(doc(dbs.admin, 'submissions/new'), { title: 'x' }));
  await assertFails(deleteDoc(doc(dbs.admin, 'submissions/s1')));
});

test('auditLog: admin reads and appends as themselves; never edited or deleted', async () => {
  const entry = (uid) => ({ action: 'article.delete', actorUid: uid, at: Timestamp.now() });
  for (const who of ['anon', 'user']) {
    await assertFails(getDoc(doc(dbs[who], 'auditLog/a1')));
    await assertFails(setDoc(doc(dbs[who], 'auditLog/n'), entry('user1')));
  }
  await assertSucceeds(getDoc(doc(dbs.admin, 'auditLog/a1')));
  await assertSucceeds(setDoc(doc(dbs.admin, 'auditLog/n1'), entry('admin1')));
  await assertFails(setDoc(doc(dbs.admin, 'auditLog/n2'), entry('someone-else')));
  await assertFails(updateDoc(doc(dbs.admin, 'auditLog/a1'), { action: 'edited' }));
  await assertFails(deleteDoc(doc(dbs.admin, 'auditLog/a1')));
});

test('collections without rules are closed to everyone (aiLimits, submissionLimits)', async () => {
  for (const who of ['anon', 'user', 'admin']) {
    await assertFails(getDoc(doc(dbs[who], 'aiLimits/x')));
    await assertFails(setDoc(doc(dbs[who], 'submissionLimits/x'), { count: 0 }));
  }
});
