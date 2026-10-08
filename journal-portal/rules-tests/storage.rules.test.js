const { test, before, after } = require('node:test');
const { assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { ref, uploadBytes, getBytes, deleteObject } = require('firebase/storage');
const { makeEnv, contexts } = require('./helpers');

const BUCKET = 'gs://demo-ijdr.appspot.com';
let env;
let st;
const bytes = new Uint8Array([1, 2, 3]);

before(async () => {
  env = await makeEnv();
  // The Storage emulator can still be loading its rules right after start-up; retry the seeding.
  for (let attempt = 1; ; attempt++) {
    try {
      await env.clearStorage();
      await env.withSecurityRulesDisabled(async (c) => {
        const s = c.storage(BUCKET);
        for (const p of ['journals/j1/issue.pdf', 'journals/covers/j1.jpg', 'boardMembers/b1/a.jpg', 'submissions/s1/manuscript.pdf', 'other/x.txt']) {
          await uploadBytes(ref(s, p), bytes);
        }
      });
      break;
    } catch (e) {
      if (attempt >= 8) throw e;
      await new Promise((r) => setTimeout(r, 750));
    }
  }
  const c = contexts(env);
  st = { anon: c.anon.storage(BUCKET), user: c.user.storage(BUCKET), admin: c.admin.storage(BUCKET) };
});
after(async () => env.cleanup());

test('journals and boardMembers: public read, admin write', async () => {
  for (const p of ['journals/j1/issue.pdf', 'journals/covers/j1.jpg', 'boardMembers/b1/a.jpg']) {
    for (const who of ['anon', 'user', 'admin']) await assertSucceeds(getBytes(ref(st[who], p)));
  }
  for (const who of ['anon', 'user']) {
    await assertFails(uploadBytes(ref(st[who], 'journals/j2/issue.pdf'), bytes));
    await assertFails(deleteObject(ref(st[who], 'journals/j1/issue.pdf')));
    await assertFails(uploadBytes(ref(st[who], 'boardMembers/b9/a.jpg'), bytes));
  }
  await assertSucceeds(uploadBytes(ref(st.admin, 'journals/j2/issue.pdf'), bytes));
});

test('submissions: admin may read; nobody writes from a client', async () => {
  for (const who of ['anon', 'user']) {
    await assertFails(getBytes(ref(st[who], 'submissions/s1/manuscript.pdf')));
    await assertFails(uploadBytes(ref(st[who], 'submissions/s2/manuscript.pdf'), bytes));
  }
  await assertSucceeds(getBytes(ref(st.admin, 'submissions/s1/manuscript.pdf')));
  await assertFails(uploadBytes(ref(st.admin, 'submissions/s2/manuscript.pdf'), bytes));
  await assertFails(deleteObject(ref(st.admin, 'submissions/s1/manuscript.pdf')));
});

test('everything else is closed', async () => {
  for (const who of ['anon', 'user', 'admin']) {
    await assertFails(getBytes(ref(st[who], 'other/x.txt')));
    await assertFails(uploadBytes(ref(st[who], 'other/y.txt'), bytes));
  }
});
