import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { runIngest, IngestError } from './ingest/run';
import { buildArticleSeo, iArticle } from './article-seo';
import {
  Ctx, answerQuestion, consume, embedAndRelate, generateSummary, generateTranslation, loadArticle,
  readAiSettings, semanticSearch as runSemanticSearch,
} from './ai/service';
import { AiFeature, cleanQuestion, visitorKey } from './ai/pure';
import type { CallableRequest } from 'firebase-functions/v2/https';
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
        model: process.env['GEMINI_MODEL'],
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

function aiCtx(): Ctx {
  return {
    db: admin.firestore(),
    bucket: admin.storage().bucket(),
    apiKey: GEMINI_API_KEY.value(),
    model: process.env['GEMINI_MODEL'],
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
    const ctx = aiCtx();
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
      const ctx = aiCtx();
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
      return await embedAndRelate(aiCtx(), typeof issueId === 'string' && issueId ? issueId : undefined);
    } catch (e) {
      throw toHttps(e);
    }
  }
);
