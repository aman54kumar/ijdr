import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import Busboy from 'busboy';
import { defineSecret, defineString } from 'firebase-functions/params';
import { runIngest, IngestError } from './ingest/run';
import { buildArticleSeo, iArticle } from './article-seo';
import {
  Ctx, answerQuestion, consume, embedAndRelate, generateSummary, generateTranslation, loadArticle,
  readAiSettings, semanticSearch as runSemanticSearch,
} from './ai/service';
import { AiFeature, cleanQuestion, visitorKey } from './ai/pure';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { buildDailyStats, yesterday } from './ops/stats';
import { safeDisplayName, validateFile, validateSubmissionFields } from './ops/submission';
import { buildContactEmail, buildSubmissionEmail, buildTestEmail, resolveNotifySettings, sendEmail } from './ops/email';
import { triageMessage } from './ai/service';
import { dayKey } from './ai/pure';
import { injectArticleHead } from './article-page';

admin.initializeApp();

const SITE_ORIGIN =
  process.env.SITEMAP_SITE_ORIGIN || 'https://ijdrpub.in';

const STATIC_PATHS = [
  '/',
  '/journals',
  '/articles',
  '/about',
  '/editorial-board',
  '/advisory-board',
  '/publisher',
  '/contact',
  '/contribute',
  '/login',
  '/legal/privacy',
  '/legal/terms',
  '/legal/copyright',
  '/legal/open-access',
  '/legal/accessibility',
];

const MAX_PROXY_BYTES = 9 * 1024 * 1024;

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Streams PDF from Storage. View counts are tracked on the SPA journal page only (see roadmap A.3). */
export const getPdf = functions.https.onRequest(async (req, res) => {
  try {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    res.set('X-Frame-Options', 'SAMEORIGIN');

    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const rawId = req.path.split('/').pop();
    const journalId = rawId ? decodeURIComponent(rawId) : '';

    if (!journalId) {
      res.status(400).send('Journal ID required');
      return;
    }

    const journalDoc = await admin
      .firestore()
      .collection('journals')
      .doc(journalId)
      .get();

    if (!journalDoc.exists) {
      res.status(404).send('Journal not found');
      return;
    }

    const journalData = journalDoc.data();

    if (!journalData?.pdfUrl) {
      res.status(404).send('PDF not available');
      return;
    }

    const bucket = admin.storage().bucket();
    const url = new URL(journalData.pdfUrl);
    const pathMatch = url.pathname.match(/\/o\/(.+?)(\?|$)/);

    if (!pathMatch) {
      res.status(500).send('Invalid PDF reference');
      return;
    }

    const filePath = decodeURIComponent(pathMatch[1]);
    const file = bucket.file(filePath);

    const [exists] = await file.exists();
    if (!exists) {
      res.status(404).send('PDF file not found');
      return;
    }

    const [metadata] = await file.getMetadata();

    // 1st-gen functions cap responses at 10 MB; larger PDFs fail with a 500.
    // Hand those off to Storage directly (reads are public per storage.rules).
    if (Number(metadata.size) > MAX_PROXY_BYTES) {
      res.set('Cache-Control', 'public, max-age=300');
      res.redirect(302, journalData.pdfUrl);
      return;
    }

    res.set('Content-Type', 'application/pdf');
    const disposition =
      req.query.disposition === 'attachment' ? 'attachment' : 'inline';
    res.set(
      'Content-Disposition',
      `${disposition}; filename="${neutralPdfDownloadFilename(journalId)}"`
    );
    res.set('Cache-Control', 'public, max-age=3600');

    if (metadata.size) {
      res.set('Content-Length', metadata.size.toString());
    }

    const stream = file.createReadStream();
    stream.on('error', (error) => {
      console.error('PDF stream error:', error);
      if (!res.headersSent) {
        res.status(500).send('Error streaming PDF');
      }
    });

    stream.pipe(res);
  } catch (error) {
    console.error('PDF proxy error:', error);
    if (!res.headersSent) {
      res.status(500).send('Internal server error');
    }
  }
});

export const sitemap = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const snap = await admin.firestore().collection('journals').get();
    const articleSnap = await admin
      .firestore()
      .collection('articles')
      .where('status', '==', 'published')
      .get();
    const urls: { loc: string; changefreq: string; priority: string }[] = [];

    for (const p of STATIC_PATHS) {
      const loc = p === '/' ? SITE_ORIGIN : `${SITE_ORIGIN}${p}`;
      urls.push({ loc, changefreq: 'weekly', priority: p === '/' ? '1.0' : '0.8' });
    }

    for (const doc of snap.docs) {
      urls.push({
        loc: `${SITE_ORIGIN}/journal/${doc.id}`,
        changefreq: 'monthly',
        priority: '0.7',
      });
    }

    for (const doc of articleSnap.docs) {
      urls.push({
        loc: `${SITE_ORIGIN}/article/${doc.id}`,
        changefreq: 'yearly',
        priority: '0.6',
      });
    }

    const body =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
      urls
        .map(
          (u) =>
            `<url><loc>${xmlEscape(u.loc)}</loc>` +
            `<changefreq>${u.changefreq}</changefreq>` +
            `<priority>${u.priority}</priority></url>`
        )
        .join('') +
      `</urlset>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.status(200).send(body);
  } catch (e) {
    console.error('sitemap error', e);
    res.status(500).send('Error generating sitemap');
  }
});

/** Last 30 issues as RSS 2.0 (newest first). */
export const rssFeed = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const snap = await admin
      .firestore()
      .collection('journals')
      .orderBy('year', 'desc')
      .orderBy('volume', 'desc')
      .orderBy('number', 'desc')
      .limit(30)
      .get();

    const items: string[] = [];
    for (const doc of snap.docs) {
      const d = doc.data();
      const title =
        (d.title as string) ||
        `Vol. ${d.volume}, No. ${d.number} (${d.year})`;
      const link = `${SITE_ORIGIN}/journal/${doc.id}`;
      const desc =
        (d.description as string) ||
        `Indian Journal of Development Research — ${title}`;
      const updated =
        d.updatedAt?.toDate?.()?.toUTCString?.() ||
        d.createdAt?.toDate?.()?.toUTCString?.() ||
        new Date().toUTCString();
      items.push(
        `<item><title>${xmlEscape(title)}</title>` +
          `<link>${xmlEscape(link)}</link>` +
          `<guid>${xmlEscape(link)}</guid>` +
          `<pubDate>${xmlEscape(updated)}</pubDate>` +
          `<description>${xmlEscape(desc)}</description></item>`
      );
    }

    const articleSnap = await admin
      .firestore()
      .collection('articles')
      .where('status', '==', 'published')
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get();
    for (const doc of articleSnap.docs) {
      const d = doc.data();
      const link = `${SITE_ORIGIN}/article/${doc.id}`;
      const authors = ((d.authors as { name: string }[]) || []).map((a) => a.name).join(', ');
      const desc =
        (d.abstract as string) ||
        `${authors ? `By ${authors}. ` : ''}${d.issueTitle ?? 'Indian Journal of Development Research'}`;
      const created = d.createdAt?.toDate?.()?.toUTCString?.() || new Date().toUTCString();
      items.push(
        `<item><title>${xmlEscape(String(d.title))}</title>` +
          `<link>${xmlEscape(link)}</link>` +
          `<guid>${xmlEscape(link)}</guid>` +
          `<pubDate>${xmlEscape(created)}</pubDate>` +
          `<description>${xmlEscape(desc)}</description></item>`
      );
    }

    const channelTitle = 'Indian Journal of Development Research — New issues and articles';
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<rss version="2.0"><channel>` +
      `<title>${xmlEscape(channelTitle)}</title>` +
      `<link>${xmlEscape(SITE_ORIGIN)}</link>` +
      `<description>${xmlEscape(
        'New issues and articles of IJDR (ijdrpub.in)'
      )}</description>` +
      `<language>en-in</language>` +
      items.join('') +
      `</channel></rss>`;

    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=1800');
    res.status(200).send(body);
  } catch (e) {
    console.error('rss error', e);
    res.status(500).send('Error generating feed');
  }
});

/** ASCII-safe download name so mobile browsers do not show the original upload file name. */
function neutralPdfDownloadFilename(journalId: string): string {
  const safe = journalId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || 'issue';
  return `ijdr-${safe}.pdf`;
}

// ---------------------------------------------------------------------------
// Gemini ingest (Phase 3)
// ---------------------------------------------------------------------------

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

type ModelUse = 'admin' | 'public';

const MODEL_ID = /^[A-Za-z0-9._-]{1,80}$/;
let modelCache: { at: number; data: Record<string, unknown> } | undefined;

/**
 * Models picked in the admin panel (`adminSettings/ai`): `model` for admin tools (extraction, triage),
 * `publicModel` for reader-facing features (summaries, translation, Ask, search). Public falls back to
 * the admin model, then GEMINI_MODEL, then the built-in default.
 */
async function configuredModel(use: ModelUse): Promise<string | undefined> {
  try {
    if (!modelCache || Date.now() - modelCache.at > 20_000) {
      const data = (await admin.firestore().doc('adminSettings/ai').get()).data() ?? {};
      modelCache = { at: Date.now(), data };
    }
    const d = modelCache.data;
    const pick = (v: unknown) => (typeof v === 'string' && MODEL_ID.test(v) ? v : undefined);
    const chosen = use === 'public' ? pick(d['publicModel']) ?? pick(d['model']) : pick(d['model']);
    if (chosen) return chosen;
  } catch (e) {
    console.warn('Could not read adminSettings/ai', e);
  }
  return process.env['GEMINI_MODEL'];
}

/**
 * Admin-only: extract draft articles from an issue's PDF with Gemini.
 * Progress and errors are written to `ingestJobs/{issueId}`.
 */
export const ingestIssue = onCall(
  {
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 540,
    memory: '1GiB',
    maxInstances: 3,
  },
  async (request) => {
    if (request.auth?.token?.['admin'] !== true) {
      throw new HttpsError('permission-denied', 'Admins only.');
    }
    const issueId = (request.data as { issueId?: unknown } | undefined)?.issueId;
    if (typeof issueId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(issueId)) {
      throw new HttpsError('invalid-argument', 'issueId is required.');
    }
    try {
      return await runIngest({
        db: admin.firestore(),
        bucket: admin.storage().bucket(),
        apiKey: GEMINI_API_KEY.value(),
        issueId,
        model: await configuredModel('admin'),
      });
    } catch (e) {
      if (e instanceof IngestError) {
        throw new HttpsError(e.code, e.message);
      }
      throw new HttpsError('internal', 'Extraction failed.');
    }
  }
);

// ---------------------------------------------------------------------------
// Article pages for crawlers (Phase 4)
// ---------------------------------------------------------------------------

let shellCache: { html: string; at: number } | undefined;
const SHELL_TTL_MS = 5 * 60 * 1000;

async function loadShell(): Promise<string> {
  if (shellCache && Date.now() - shellCache.at < SHELL_TTL_MS) {
    return shellCache.html;
  }
  // /index.html is served by Hosting directly (it is not rewritten to this function).
  const r = await fetch(`${SITE_ORIGIN}/index.html`);
  if (!r.ok) {
    throw new Error(`index.html fetch failed: ${r.status}`);
  }
  const html = await r.text();
  shellCache = { html, at: Date.now() };
  return html;
}

/**
 * Hosting rewrites /article/** here. Returns the SPA shell with the article's head tags
 * (Scholar, Open Graph, canonical, JSON-LD) already in the HTML, so crawlers need no JavaScript.
 */
export const articlePage = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  try {
    const id = decodeURIComponent(req.path.split('/').filter(Boolean).pop() ?? '');
    const shell = await loadShell();
    const snap = id && /^[A-Za-z0-9_-]{1,128}$/.test(id)
      ? await admin.firestore().collection('articles').doc(id).get()
      : undefined;
    const data = snap?.exists ? snap.data() : undefined;

    res.set('Content-Type', 'text/html; charset=utf-8');
    if (!data || data.status !== 'published') {
      // Unknown or unpublished: let the SPA render its own "not found" view, but tell crawlers it is a 404.
      res.set('Cache-Control', 'public, max-age=60');
      res.status(404).send(shell);
      return;
    }
    const article = { id: snap!.id, ...data } as unknown as iArticle;
    const html = injectArticleHead(shell, article, buildArticleSeo(article, SITE_ORIGIN));
    res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
    res.status(200).send(html);
  } catch (e) {
    console.error('articlePage error', e);
    res.status(500).send('Error loading article');
  }
});

// ---------------------------------------------------------------------------
// Reader-facing AI (Phase 5)
// ---------------------------------------------------------------------------

const isAdminCall = (r: CallableRequest) => r.auth?.token?.['admin'] === true;

async function aiCtx(use: ModelUse = 'public'): Promise<Ctx> {
  return {
    db: admin.firestore(),
    bucket: admin.storage().bucket(),
    apiKey: GEMINI_API_KEY.value(),
    model: await configuredModel(use),
    embeddingModel: process.env['GEMINI_EMBEDDING_MODEL'],
  };
}

function toHttps(e: unknown): HttpsError {
  if (e instanceof HttpsError) return e;
  if (e instanceof IngestError) return new HttpsError(e.code, e.message);
  console.error('AI function error', e);
  return new HttpsError('internal', 'Something went wrong. Please try again.');
}

/** Public-callable wrapper: kill switch, then the handler. Admins bypass the switch (to pre-generate content). */
async function guarded<T>(
  r: CallableRequest,
  feature: AiFeature,
  run: (ctx: Ctx, visitor: string, admin: boolean) => Promise<T>
): Promise<T> {
  try {
    const ctx = await aiCtx();
    const isAdmin = isAdminCall(r);
    if (!isAdmin && !(await readAiSettings(ctx.db))[feature]) {
      throw new HttpsError('failed-precondition', 'This feature is currently turned off.');
    }
    return await run(ctx, visitorKey(r.rawRequest?.ip, process.env['GCLOUD_PROJECT'] ?? 'ijdr'), isAdmin);
  } catch (e) {
    throw toHttps(e);
  }
}

const publicAi = {
  secrets: [GEMINI_API_KEY],
  enforceAppCheck: true,
  timeoutSeconds: 120,
  memory: '1GiB' as const,
  maxInstances: 5,
};

const articleIdOf = (r: CallableRequest): string => {
  const id = (r.data as { articleId?: unknown } | undefined)?.articleId;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new HttpsError('invalid-argument', 'articleId is required.');
  }
  return id;
};

/** Cached plain-language summary; generated on first request, then served from Firestore by the client. */
export const summarizeArticle = onCall(publicAi, (r) =>
  guarded(r, 'summaries', async (ctx, visitor, isAdmin) => {
    const a = await loadArticle(ctx.db, articleIdOf(r), isAdmin);
    const ref = ctx.db.doc(`articles/${a.id}/ai/summary`);
    const cached = (await ref.get()).data();
    if (cached) return { text: cached['text'], keyPoints: cached['keyPoints'], hidden: !!cached['hidden'], cached: true };
    await consume(ctx.db, 'summaries', visitor, { enforce: !isAdmin });
    const s = await generateSummary(ctx, a);
    return { text: s.text, keyPoints: s.keyPoints, hidden: s.hidden, cached: false };
  })
);

export const translateArticle = onCall(publicAi, (r) =>
  guarded(r, 'translation', async (ctx, visitor, isAdmin) => {
    const lang = (r.data as { lang?: unknown })?.lang;
    if (lang !== 'hi') throw new HttpsError('invalid-argument', 'Only Hindi (hi) is supported.');
    const a = await loadArticle(ctx.db, articleIdOf(r), isAdmin);
    const cached = (await ctx.db.doc(`articles/${a.id}/ai/translation_hi`).get()).data();
    if (cached) return { ...cached, generatedAt: undefined, cached: true };
    await consume(ctx.db, 'translation', visitor, { enforce: !isAdmin });
    return { ...(await generateTranslation(ctx, a, 'hi')), cached: false };
  })
);

/** Grounded Q&A on one article's pages. Nothing about the conversation is stored. */
export const askPaper = onCall({ ...publicAi, timeoutSeconds: 90 }, (r) =>
  guarded(r, 'chat', async (ctx, visitor, isAdmin) => {
    const question = cleanQuestion((r.data as { question?: unknown })?.question);
    if (!question) throw new HttpsError('invalid-argument', 'Please type a question (3 to 400 characters).');
    const a = await loadArticle(ctx.db, articleIdOf(r), false);
    await consume(ctx.db, 'chat', visitor, { enforce: !isAdmin });
    return answerQuestion(ctx, a, question);
  })
);

export const semanticSearch = onCall(publicAi, (r) =>
  guarded(r, 'semanticSearch', async (ctx, visitor, isAdmin) => {
    const q = cleanQuestion((r.data as { query?: unknown })?.query);
    if (!q) throw new HttpsError('invalid-argument', 'Enter a search phrase.');
    await consume(ctx.db, 'semanticSearch', visitor, { enforce: !isAdmin });
    return { hits: await runSemanticSearch(ctx, q) };
  })
);

/** Admin: (re)generate a summary or translation, bypassing the kill switch and limits. */
export const adminGenerateAi = onCall(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 180, memory: '1GiB', maxInstances: 3 },
  async (r) => {
    if (!isAdminCall(r)) throw new HttpsError('permission-denied', 'Admins only.');
    try {
      const ctx = await aiCtx();
      const kind = (r.data as { kind?: unknown })?.kind;
      const a = await loadArticle(ctx.db, articleIdOf(r), true);
      if (kind === 'summary') {
        await consume(ctx.db, 'summaries', 'admin', { enforce: false });
        await generateSummary(ctx, a);
      } else if (kind === 'translation') {
        await consume(ctx.db, 'translation', 'admin', { enforce: false });
        await generateTranslation(ctx, a, 'hi');
      } else {
        throw new HttpsError('invalid-argument', 'kind must be summary or translation.');
      }
      return { ok: true };
    } catch (e) {
      throw toHttps(e);
    }
  }
);

/** Admin: compute embeddings for published articles and refresh the related-articles lists. */
export const embedArticles = onCall(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 300, memory: '1GiB', maxInstances: 1 },
  async (r) => {
    if (!isAdminCall(r)) throw new HttpsError('permission-denied', 'Admins only.');
    try {
      const issueId = (r.data as { issueId?: unknown })?.issueId;
      return await embedAndRelate(await aiCtx(), typeof issueId === 'string' && issueId ? issueId : undefined);
    } catch (e) {
      throw toHttps(e);
    }
  }
);

// ---------------------------------------------------------------------------
// Admin tooling, submissions and notifications (Phase 7)
// ---------------------------------------------------------------------------

const RESEND_API_KEY = defineSecret('RESEND_API_KEY');
/** Default recipients (comma separated) until an admin saves a list in Admin > Notifications. Set in functions/.env. */
const NOTIFY_EMAIL_TO = defineString('NOTIFY_EMAIL_TO', { default: '' });
const NOTIFY_EMAIL_FROM = defineString('NOTIFY_EMAIL_FROM', { default: 'IJDR <onboarding@resend.dev>' });

async function notifySettings() {
  const snap = await admin.firestore().doc('adminSettings/notifications').get();
  return resolveNotifySettings(snap.data(), NOTIFY_EMAIL_TO.value());
}

/** Admin: send a test email to the saved recipients (to check that Resend is working). */
export const sendTestNotification = onCall({ secrets: [RESEND_API_KEY], memory: '256MiB' }, async (r) => {
  if (!isAdminCall(r)) throw new HttpsError('permission-denied', 'Admins only.');
  const { emails } = await notifySettings();
  if (!emails.length) throw new HttpsError('failed-precondition', 'Add at least one recipient and save first.');
  const ok = await sendEmail(RESEND_API_KEY.value(), buildTestEmail(NOTIFY_EMAIL_FROM.value(), emails, String(r.auth?.token?.email ?? 'an admin')));
  if (!ok) throw new HttpsError('internal', 'The email provider rejected the message. Check the Resend key and sender address in the function logs.');
  return { sentTo: emails.length };
});

async function snapshotStats(date: string) {
  const db = admin.firestore();
  const [journals, articles, contacts, subs, ai] = await Promise.all([
    db.collection('journals').select('title', 'viewCount').get(),
    db.collection('articles').select('title', 'viewCount', 'status').get(),
    db.collection('contactSubmissions').count().get(),
    db.collection('submissions').count().get(),
    db.doc(`aiStats/${date}`).get(),
  ]);
  const stats = buildDailyStats({
    date,
    journals: journals.docs.map((d) => ({ id: d.id, title: String(d.get('title') ?? ''), viewCount: d.get('viewCount') })),
    articles: articles.docs.map((d) => ({ id: d.id, title: String(d.get('title') ?? ''), viewCount: d.get('viewCount'), status: d.get('status') })),
    contacts: contacts.data().count,
    submissions: subs.data().count,
    ai: (ai.data() ?? {}) as Record<string, unknown>,
  });
  await db.doc(`statsDaily/${date}`).set({ ...stats, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  return stats;
}

/** End-of-day snapshot of the cumulative counters, labelled with the day that just ended. */
export const scheduledStatsRollup = onSchedule({ schedule: '10 0 * * *', timeZone: 'UTC', memory: '256MiB' }, async () => {
  await snapshotStats(yesterday());
});

/** Admin: take a snapshot for today now (so the dashboard has data before the first scheduled run). */
export const rollupStatsNow = onCall({ memory: '256MiB' }, async (r) => {
  if (!isAdminCall(r)) throw new HttpsError('permission-denied', 'Admins only.');
  const s = await snapshotStats(dayKey());
  return { date: s.date };
});

/** Admin: classify a contact message and draft a reply (stored on the message; never sent). */
export const triageContact = onCall(
  { secrets: [GEMINI_API_KEY], timeoutSeconds: 90, memory: '512MiB', maxInstances: 2 },
  async (r) => {
    if (!isAdminCall(r)) throw new HttpsError('permission-denied', 'Admins only.');
    try {
      const ctx = await aiCtx('admin');
      if (!(await readAiSettings(ctx.db)).contactTriage) {
        throw new HttpsError('failed-precondition', 'Message triage is switched off (Admin > AI).');
      }
      const id = (r.data as { id?: unknown })?.id;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
        throw new HttpsError('invalid-argument', 'Message id is required.');
      }
      await consume(ctx.db, 'contactTriage', 'admin', { enforce: true });
      return await triageMessage(ctx, id);
    } catch (e) {
      throw toHttps(e);
    }
  }
);

/** Email the editorial office when a contact message arrives (only when NOTIFY_EMAIL_TO is set). */
export const onContactCreated = onDocumentCreated(
  { document: 'contactSubmissions/{id}', secrets: [RESEND_API_KEY], memory: '256MiB' },
  async (event) => {
    const cfg = await notifySettings();
    const d = event.data?.data();
    if (!cfg.onContact || !cfg.emails.length || !d) return;
    await sendEmail(
      RESEND_API_KEY.value(),
      buildContactEmail(
        { name: String(d['name'] ?? ''), email: String(d['email'] ?? ''), message: String(d['message'] ?? '') },
        NOTIFY_EMAIL_FROM.value(),
        cfg.emails,
        `${SITE_ORIGIN}/admin`
      )
    );
  }
);

const SUBMISSION_ORIGINS = ['https://ijdrpub.in', 'https://www.ijdrpub.in', 'https://ijdr-e41d4.web.app', 'http://localhost:4200'];
const MAX_SUBMISSIONS_PER_VISITOR_DAY = 3;
const MAX_SUBMISSIONS_PER_DAY = 30;

/**
 * Manuscript submissions (multipart POST, same-origin via the /api/submit rewrite). Requires an
 * App Check token. Files are validated (type, size, real signature) and stored privately under
 * submissions/{id}/; the record is created with the Admin SDK, so clients can never write it.
 */
export const submitManuscript = onRequest(
  { secrets: [RESEND_API_KEY], timeoutSeconds: 300, memory: '1GiB', maxInstances: 5, cors: SUBMISSION_ORIGINS },
  async (req, res) => {
    const fail = (status: number, message: string | string[]) => {
      res.status(status).json({ error: Array.isArray(message) ? message.join(' ') : message });
    };
    if (req.method !== 'POST') return fail(405, 'Method not allowed.');
    if (!String(req.headers['content-type'] ?? '').startsWith('multipart/form-data')) return fail(400, 'Expected a form upload.');
    try {
      const token = req.header('X-Firebase-AppCheck');
      if (!token) return fail(401, 'Could not verify this browser. Reload the page and try again.');
      try {
        await admin.appCheck().verifyToken(token);
      } catch {
        return fail(401, 'Could not verify this browser. Reload the page and try again.');
      }

      const db = admin.firestore();
      const day = dayKey();
      const visitor = visitorKey(req.ip, process.env['GCLOUD_PROJECT'] ?? 'ijdr');
      const vRef = db.doc(`submissionLimits/${day}_${visitor}`);
      const allRef = db.doc(`submissionLimits/${day}_all`);
      const allowed = await db.runTransaction(async (tx) => {
        const [v, all] = await Promise.all([tx.get(vRef), tx.get(allRef)]);
        const mine = (v.data()?.['count'] as number | undefined) ?? 0;
        const total = (all.data()?.['count'] as number | undefined) ?? 0;
        if (mine >= MAX_SUBMISSIONS_PER_VISITOR_DAY || total >= MAX_SUBMISSIONS_PER_DAY) return false;
        tx.set(vRef, { count: mine + 1 }, { merge: true });
        tx.set(allRef, { count: total + 1 }, { merge: true });
        return true;
      });
      if (!allowed) return fail(429, 'The daily submission limit was reached. Please try again tomorrow or email the editor.');

      const fields: Record<string, string> = {};
      const files: Record<string, { name: string; data: Buffer; truncated: boolean }> = {};
      await new Promise<void>((resolve, reject) => {
        const bb = Busboy({ headers: req.headers, limits: { files: 2, fileSize: 15 * 1024 * 1024 + 1, fields: 20, fieldSize: 10_000 } });
        bb.on('field', (name, value) => {
          fields[name] = value;
        });
        bb.on('file', (name, stream, info) => {
          if (name !== 'manuscript' && name !== 'coverLetter') {
            stream.resume();
            return;
          }
          const chunks: Buffer[] = [];
          let truncated = false;
          stream.on('data', (c: Buffer) => chunks.push(c));
          stream.on('limit', () => (truncated = true));
          stream.on('end', () => {
            files[name] = { name: info.filename ?? 'file', data: Buffer.concat(chunks), truncated };
          });
        });
        bb.on('error', reject);
        bb.on('close', resolve);
        bb.end(req.rawBody);
      });

      const parsed = validateSubmissionFields(fields);
      const errors: string[] = parsed.ok ? [] : [...parsed.errors];
      const stored: { kind: 'manuscript' | 'coverLetter'; path: string; name: string; size: number; contentType: string }[] = [];
      const id = db.collection('submissions').doc().id;
      const toStore: { kind: 'manuscript' | 'coverLetter'; ext: string; contentType: string; data: Buffer; name: string }[] = [];
      if (!files['manuscript']) errors.push('The manuscript file is required.');
      for (const kind of ['manuscript', 'coverLetter'] as const) {
        const f = files[kind];
        if (!f) continue;
        const v = f.truncated ? ({ ok: false, error: `The ${kind === 'manuscript' ? 'manuscript' : 'cover letter'} file is too large.` } as const) : validateFile(kind, f.name, f.data);
        if (!v.ok) errors.push(v.error);
        else toStore.push({ kind, ext: v.ext, contentType: v.contentType, data: f.data, name: safeDisplayName(f.name) });
      }
      if (errors.length || !parsed.ok) return fail(400, errors);

      const bucket = admin.storage().bucket();
      for (const f of toStore) {
        const path = `submissions/${id}/${f.kind}.${f.ext}`;
        await bucket.file(path).save(f.data, { contentType: f.contentType, resumable: false });
        stored.push({ kind: f.kind, path, name: f.name, size: f.data.length, contentType: f.contentType });
      }
      const now = admin.firestore.Timestamp.now();
      await db.doc(`submissions/${id}`).set({
        ...parsed.value,
        status: 'received',
        files: stored,
        history: [{ status: 'received', at: now, by: 'system' }],
        notes: [],
        createdAt: now,
        updatedAt: now,
      });

      const cfg = await notifySettings();
      if (cfg.onSubmission && cfg.emails.length) {
        await sendEmail(
          RESEND_API_KEY.value(),
          buildSubmissionEmail(
            { id, name: parsed.value.name, email: parsed.value.email, affiliation: parsed.value.affiliation, title: parsed.value.title, keywords: parsed.value.keywords, files: stored },
            NOTIFY_EMAIL_FROM.value(),
            cfg.emails,
            `${SITE_ORIGIN}/admin`
          )
        );
      }
      res.status(200).json({ id });
    } catch (e) {
      console.error('submitManuscript error', e);
      fail(500, 'Something went wrong while saving your submission. Please try again or email the editor.');
    }
  }
);
