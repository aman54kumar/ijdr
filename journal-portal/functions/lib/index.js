"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitManuscript = exports.onContactCreated = exports.triageContact = exports.rollupStatsNow = exports.scheduledStatsRollup = exports.embedArticles = exports.adminGenerateAi = exports.semanticSearch = exports.askPaper = exports.translateArticle = exports.summarizeArticle = exports.articlePage = exports.ingestIssue = exports.rssFeed = exports.sitemap = exports.getPdf = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const firestore_1 = require("firebase-functions/v2/firestore");
const busboy_1 = __importDefault(require("busboy"));
const params_1 = require("firebase-functions/params");
const run_1 = require("./ingest/run");
const article_seo_1 = require("./article-seo");
const service_1 = require("./ai/service");
const pure_1 = require("./ai/pure");
const stats_1 = require("./ops/stats");
const submission_1 = require("./ops/submission");
const email_1 = require("./ops/email");
const service_2 = require("./ai/service");
const pure_2 = require("./ai/pure");
const article_page_1 = require("./article-page");
admin.initializeApp();
const SITE_ORIGIN = process.env.SITEMAP_SITE_ORIGIN || 'https://ijdrpub.in';
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
function xmlEscape(s) {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
/** Streams PDF from Storage. View counts are tracked on the SPA journal page only (see roadmap A.3). */
exports.getPdf = functions.https.onRequest(async (req, res) => {
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
        const disposition = req.query.disposition === 'attachment' ? 'attachment' : 'inline';
        res.set('Content-Disposition', `${disposition}; filename="${neutralPdfDownloadFilename(journalId)}"`);
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
    }
    catch (error) {
        console.error('PDF proxy error:', error);
        if (!res.headersSent) {
            res.status(500).send('Internal server error');
        }
    }
});
exports.sitemap = functions.https.onRequest(async (req, res) => {
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
        const urls = [];
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
        const body = `<?xml version="1.0" encoding="UTF-8"?>` +
            `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
            urls
                .map((u) => `<url><loc>${xmlEscape(u.loc)}</loc>` +
                `<changefreq>${u.changefreq}</changefreq>` +
                `<priority>${u.priority}</priority></url>`)
                .join('') +
            `</urlset>`;
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=3600');
        res.status(200).send(body);
    }
    catch (e) {
        console.error('sitemap error', e);
        res.status(500).send('Error generating sitemap');
    }
});
/** Last 30 issues as RSS 2.0 (newest first). */
exports.rssFeed = functions.https.onRequest(async (req, res) => {
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
        const items = [];
        for (const doc of snap.docs) {
            const d = doc.data();
            const title = d.title ||
                `Vol. ${d.volume}, No. ${d.number} (${d.year})`;
            const link = `${SITE_ORIGIN}/journal/${doc.id}`;
            const desc = d.description ||
                `Indian Journal of Development Research — ${title}`;
            const updated = d.updatedAt?.toDate?.()?.toUTCString?.() ||
                d.createdAt?.toDate?.()?.toUTCString?.() ||
                new Date().toUTCString();
            items.push(`<item><title>${xmlEscape(title)}</title>` +
                `<link>${xmlEscape(link)}</link>` +
                `<guid>${xmlEscape(link)}</guid>` +
                `<pubDate>${xmlEscape(updated)}</pubDate>` +
                `<description>${xmlEscape(desc)}</description></item>`);
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
            const authors = (d.authors || []).map((a) => a.name).join(', ');
            const desc = d.abstract ||
                `${authors ? `By ${authors}. ` : ''}${d.issueTitle ?? 'Indian Journal of Development Research'}`;
            const created = d.createdAt?.toDate?.()?.toUTCString?.() || new Date().toUTCString();
            items.push(`<item><title>${xmlEscape(String(d.title))}</title>` +
                `<link>${xmlEscape(link)}</link>` +
                `<guid>${xmlEscape(link)}</guid>` +
                `<pubDate>${xmlEscape(created)}</pubDate>` +
                `<description>${xmlEscape(desc)}</description></item>`);
        }
        const channelTitle = 'Indian Journal of Development Research — New issues and articles';
        const body = `<?xml version="1.0" encoding="UTF-8"?>` +
            `<rss version="2.0"><channel>` +
            `<title>${xmlEscape(channelTitle)}</title>` +
            `<link>${xmlEscape(SITE_ORIGIN)}</link>` +
            `<description>${xmlEscape('New issues and articles of IJDR (ijdrpub.in)')}</description>` +
            `<language>en-in</language>` +
            items.join('') +
            `</channel></rss>`;
        res.set('Content-Type', 'application/rss+xml; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=1800');
        res.status(200).send(body);
    }
    catch (e) {
        console.error('rss error', e);
        res.status(500).send('Error generating feed');
    }
});
/** ASCII-safe download name so mobile browsers do not show the original upload file name. */
function neutralPdfDownloadFilename(journalId) {
    const safe = journalId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || 'issue';
    return `ijdr-${safe}.pdf`;
}
// ---------------------------------------------------------------------------
// Gemini ingest (Phase 3)
// ---------------------------------------------------------------------------
const GEMINI_API_KEY = (0, params_1.defineSecret)('GEMINI_API_KEY');
/**
 * Admin-only: extract draft articles from an issue's PDF with Gemini.
 * Progress and errors are written to `ingestJobs/{issueId}`.
 */
exports.ingestIssue = (0, https_1.onCall)({
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 540,
    memory: '1GiB',
    maxInstances: 3,
}, async (request) => {
    if (request.auth?.token?.['admin'] !== true) {
        throw new https_1.HttpsError('permission-denied', 'Admins only.');
    }
    const issueId = request.data?.issueId;
    if (typeof issueId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(issueId)) {
        throw new https_1.HttpsError('invalid-argument', 'issueId is required.');
    }
    try {
        return await (0, run_1.runIngest)({
            db: admin.firestore(),
            bucket: admin.storage().bucket(),
            apiKey: GEMINI_API_KEY.value(),
            issueId,
            model: process.env['GEMINI_MODEL'],
        });
    }
    catch (e) {
        if (e instanceof run_1.IngestError) {
            throw new https_1.HttpsError(e.code, e.message);
        }
        throw new https_1.HttpsError('internal', 'Extraction failed.');
    }
});
// ---------------------------------------------------------------------------
// Article pages for crawlers (Phase 4)
// ---------------------------------------------------------------------------
let shellCache;
const SHELL_TTL_MS = 5 * 60 * 1000;
async function loadShell() {
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
exports.articlePage = functions.https.onRequest(async (req, res) => {
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
        const article = { id: snap.id, ...data };
        const html = (0, article_page_1.injectArticleHead)(shell, article, (0, article_seo_1.buildArticleSeo)(article, SITE_ORIGIN));
        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.status(200).send(html);
    }
    catch (e) {
        console.error('articlePage error', e);
        res.status(500).send('Error loading article');
    }
});
// ---------------------------------------------------------------------------
// Reader-facing AI (Phase 5)
// ---------------------------------------------------------------------------
const isAdminCall = (r) => r.auth?.token?.['admin'] === true;
function aiCtx() {
    return {
        db: admin.firestore(),
        bucket: admin.storage().bucket(),
        apiKey: GEMINI_API_KEY.value(),
        model: process.env['GEMINI_MODEL'],
        embeddingModel: process.env['GEMINI_EMBEDDING_MODEL'],
    };
}
function toHttps(e) {
    if (e instanceof https_1.HttpsError)
        return e;
    if (e instanceof run_1.IngestError)
        return new https_1.HttpsError(e.code, e.message);
    console.error('AI function error', e);
    return new https_1.HttpsError('internal', 'Something went wrong. Please try again.');
}
/** Public-callable wrapper: kill switch, then the handler. Admins bypass the switch (to pre-generate content). */
async function guarded(r, feature, run) {
    try {
        const ctx = aiCtx();
        const isAdmin = isAdminCall(r);
        if (!isAdmin && !(await (0, service_1.readAiSettings)(ctx.db))[feature]) {
            throw new https_1.HttpsError('failed-precondition', 'This feature is currently turned off.');
        }
        return await run(ctx, (0, pure_1.visitorKey)(r.rawRequest?.ip, process.env['GCLOUD_PROJECT'] ?? 'ijdr'), isAdmin);
    }
    catch (e) {
        throw toHttps(e);
    }
}
const publicAi = {
    secrets: [GEMINI_API_KEY],
    enforceAppCheck: true,
    timeoutSeconds: 120,
    memory: '1GiB',
    maxInstances: 5,
};
const articleIdOf = (r) => {
    const id = r.data?.articleId;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
        throw new https_1.HttpsError('invalid-argument', 'articleId is required.');
    }
    return id;
};
/** Cached plain-language summary; generated on first request, then served from Firestore by the client. */
exports.summarizeArticle = (0, https_1.onCall)(publicAi, (r) => guarded(r, 'summaries', async (ctx, visitor, isAdmin) => {
    const a = await (0, service_1.loadArticle)(ctx.db, articleIdOf(r), isAdmin);
    const ref = ctx.db.doc(`articles/${a.id}/ai/summary`);
    const cached = (await ref.get()).data();
    if (cached)
        return { text: cached['text'], keyPoints: cached['keyPoints'], hidden: !!cached['hidden'], cached: true };
    await (0, service_1.consume)(ctx.db, 'summaries', visitor, { enforce: !isAdmin });
    const s = await (0, service_1.generateSummary)(ctx, a);
    return { text: s.text, keyPoints: s.keyPoints, hidden: s.hidden, cached: false };
}));
exports.translateArticle = (0, https_1.onCall)(publicAi, (r) => guarded(r, 'translation', async (ctx, visitor, isAdmin) => {
    const lang = r.data?.lang;
    if (lang !== 'hi')
        throw new https_1.HttpsError('invalid-argument', 'Only Hindi (hi) is supported.');
    const a = await (0, service_1.loadArticle)(ctx.db, articleIdOf(r), isAdmin);
    const cached = (await ctx.db.doc(`articles/${a.id}/ai/translation_hi`).get()).data();
    if (cached)
        return { ...cached, generatedAt: undefined, cached: true };
    await (0, service_1.consume)(ctx.db, 'translation', visitor, { enforce: !isAdmin });
    return { ...(await (0, service_1.generateTranslation)(ctx, a, 'hi')), cached: false };
}));
/** Grounded Q&A on one article's pages. Nothing about the conversation is stored. */
exports.askPaper = (0, https_1.onCall)({ ...publicAi, timeoutSeconds: 90 }, (r) => guarded(r, 'chat', async (ctx, visitor, isAdmin) => {
    const question = (0, pure_1.cleanQuestion)(r.data?.question);
    if (!question)
        throw new https_1.HttpsError('invalid-argument', 'Please type a question (3 to 400 characters).');
    const a = await (0, service_1.loadArticle)(ctx.db, articleIdOf(r), false);
    await (0, service_1.consume)(ctx.db, 'chat', visitor, { enforce: !isAdmin });
    return (0, service_1.answerQuestion)(ctx, a, question);
}));
exports.semanticSearch = (0, https_1.onCall)(publicAi, (r) => guarded(r, 'semanticSearch', async (ctx, visitor, isAdmin) => {
    const q = (0, pure_1.cleanQuestion)(r.data?.query);
    if (!q)
        throw new https_1.HttpsError('invalid-argument', 'Enter a search phrase.');
    await (0, service_1.consume)(ctx.db, 'semanticSearch', visitor, { enforce: !isAdmin });
    return { hits: await (0, service_1.semanticSearch)(ctx, q) };
}));
/** Admin: (re)generate a summary or translation, bypassing the kill switch and limits. */
exports.adminGenerateAi = (0, https_1.onCall)({ secrets: [GEMINI_API_KEY], timeoutSeconds: 180, memory: '1GiB', maxInstances: 3 }, async (r) => {
    if (!isAdminCall(r))
        throw new https_1.HttpsError('permission-denied', 'Admins only.');
    try {
        const ctx = aiCtx();
        const kind = r.data?.kind;
        const a = await (0, service_1.loadArticle)(ctx.db, articleIdOf(r), true);
        if (kind === 'summary') {
            await (0, service_1.consume)(ctx.db, 'summaries', 'admin', { enforce: false });
            await (0, service_1.generateSummary)(ctx, a);
        }
        else if (kind === 'translation') {
            await (0, service_1.consume)(ctx.db, 'translation', 'admin', { enforce: false });
            await (0, service_1.generateTranslation)(ctx, a, 'hi');
        }
        else {
            throw new https_1.HttpsError('invalid-argument', 'kind must be summary or translation.');
        }
        return { ok: true };
    }
    catch (e) {
        throw toHttps(e);
    }
});
/** Admin: compute embeddings for published articles and refresh the related-articles lists. */
exports.embedArticles = (0, https_1.onCall)({ secrets: [GEMINI_API_KEY], timeoutSeconds: 300, memory: '1GiB', maxInstances: 1 }, async (r) => {
    if (!isAdminCall(r))
        throw new https_1.HttpsError('permission-denied', 'Admins only.');
    try {
        const issueId = r.data?.issueId;
        return await (0, service_1.embedAndRelate)(aiCtx(), typeof issueId === 'string' && issueId ? issueId : undefined);
    }
    catch (e) {
        throw toHttps(e);
    }
});
// ---------------------------------------------------------------------------
// Admin tooling, submissions and notifications (Phase 7)
// ---------------------------------------------------------------------------
const RESEND_API_KEY = (0, params_1.defineSecret)('RESEND_API_KEY');
/** Where notification emails go (empty = notifications off). Set in functions/.env. */
const NOTIFY_EMAIL_TO = (0, params_1.defineString)('NOTIFY_EMAIL_TO', { default: '' });
const NOTIFY_EMAIL_FROM = (0, params_1.defineString)('NOTIFY_EMAIL_FROM', { default: 'IJDR <onboarding@resend.dev>' });
async function snapshotStats(date) {
    const db = admin.firestore();
    const [journals, articles, contacts, subs, ai] = await Promise.all([
        db.collection('journals').select('title', 'viewCount').get(),
        db.collection('articles').select('title', 'viewCount', 'status').get(),
        db.collection('contactSubmissions').count().get(),
        db.collection('submissions').count().get(),
        db.doc(`aiStats/${date}`).get(),
    ]);
    const stats = (0, stats_1.buildDailyStats)({
        date,
        journals: journals.docs.map((d) => ({ id: d.id, title: String(d.get('title') ?? ''), viewCount: d.get('viewCount') })),
        articles: articles.docs.map((d) => ({ id: d.id, title: String(d.get('title') ?? ''), viewCount: d.get('viewCount'), status: d.get('status') })),
        contacts: contacts.data().count,
        submissions: subs.data().count,
        ai: (ai.data() ?? {}),
    });
    await db.doc(`statsDaily/${date}`).set({ ...stats, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    return stats;
}
/** End-of-day snapshot of the cumulative counters, labelled with the day that just ended. */
exports.scheduledStatsRollup = (0, scheduler_1.onSchedule)({ schedule: '10 0 * * *', timeZone: 'UTC', memory: '256MiB' }, async () => {
    await snapshotStats((0, stats_1.yesterday)());
});
/** Admin: take a snapshot for today now (so the dashboard has data before the first scheduled run). */
exports.rollupStatsNow = (0, https_1.onCall)({ memory: '256MiB' }, async (r) => {
    if (!isAdminCall(r))
        throw new https_1.HttpsError('permission-denied', 'Admins only.');
    const s = await snapshotStats((0, pure_2.dayKey)());
    return { date: s.date };
});
/** Admin: classify a contact message and draft a reply (stored on the message; never sent). */
exports.triageContact = (0, https_1.onCall)({ secrets: [GEMINI_API_KEY], timeoutSeconds: 90, memory: '512MiB', maxInstances: 2 }, async (r) => {
    if (!isAdminCall(r))
        throw new https_1.HttpsError('permission-denied', 'Admins only.');
    try {
        const ctx = aiCtx();
        if (!(await (0, service_1.readAiSettings)(ctx.db)).contactTriage) {
            throw new https_1.HttpsError('failed-precondition', 'Message triage is switched off (Admin > AI).');
        }
        const id = r.data?.id;
        if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
            throw new https_1.HttpsError('invalid-argument', 'Message id is required.');
        }
        await (0, service_1.consume)(ctx.db, 'contactTriage', 'admin', { enforce: true });
        return await (0, service_2.triageMessage)(ctx, id);
    }
    catch (e) {
        throw toHttps(e);
    }
});
/** Email the editorial office when a contact message arrives (only when NOTIFY_EMAIL_TO is set). */
exports.onContactCreated = (0, firestore_1.onDocumentCreated)({ document: 'contactSubmissions/{id}', secrets: [RESEND_API_KEY], memory: '256MiB' }, async (event) => {
    const to = NOTIFY_EMAIL_TO.value();
    const d = event.data?.data();
    if (!to || !d)
        return;
    await (0, email_1.sendEmail)(RESEND_API_KEY.value(), (0, email_1.buildContactEmail)({ name: String(d['name'] ?? ''), email: String(d['email'] ?? ''), message: String(d['message'] ?? '') }, NOTIFY_EMAIL_FROM.value(), to, `${SITE_ORIGIN}/admin`));
});
const SUBMISSION_ORIGINS = ['https://ijdrpub.in', 'https://www.ijdrpub.in', 'https://ijdr-e41d4.web.app', 'http://localhost:4200'];
const MAX_SUBMISSIONS_PER_VISITOR_DAY = 3;
const MAX_SUBMISSIONS_PER_DAY = 30;
/**
 * Manuscript submissions (multipart POST, same-origin via the /api/submit rewrite). Requires an
 * App Check token. Files are validated (type, size, real signature) and stored privately under
 * submissions/{id}/; the record is created with the Admin SDK, so clients can never write it.
 */
exports.submitManuscript = (0, https_1.onRequest)({ secrets: [RESEND_API_KEY], timeoutSeconds: 300, memory: '1GiB', maxInstances: 5, cors: SUBMISSION_ORIGINS }, async (req, res) => {
    const fail = (status, message) => {
        res.status(status).json({ error: Array.isArray(message) ? message.join(' ') : message });
    };
    if (req.method !== 'POST')
        return fail(405, 'Method not allowed.');
    if (!String(req.headers['content-type'] ?? '').startsWith('multipart/form-data'))
        return fail(400, 'Expected a form upload.');
    try {
        const token = req.header('X-Firebase-AppCheck');
        if (!token)
            return fail(401, 'Could not verify this browser. Reload the page and try again.');
        try {
            await admin.appCheck().verifyToken(token);
        }
        catch {
            return fail(401, 'Could not verify this browser. Reload the page and try again.');
        }
        const db = admin.firestore();
        const day = (0, pure_2.dayKey)();
        const visitor = (0, pure_1.visitorKey)(req.ip, process.env['GCLOUD_PROJECT'] ?? 'ijdr');
        const vRef = db.doc(`submissionLimits/${day}_${visitor}`);
        const allRef = db.doc(`submissionLimits/${day}_all`);
        const allowed = await db.runTransaction(async (tx) => {
            const [v, all] = await Promise.all([tx.get(vRef), tx.get(allRef)]);
            const mine = v.data()?.['count'] ?? 0;
            const total = all.data()?.['count'] ?? 0;
            if (mine >= MAX_SUBMISSIONS_PER_VISITOR_DAY || total >= MAX_SUBMISSIONS_PER_DAY)
                return false;
            tx.set(vRef, { count: mine + 1 }, { merge: true });
            tx.set(allRef, { count: total + 1 }, { merge: true });
            return true;
        });
        if (!allowed)
            return fail(429, 'The daily submission limit was reached. Please try again tomorrow or email the editor.');
        const fields = {};
        const files = {};
        await new Promise((resolve, reject) => {
            const bb = (0, busboy_1.default)({ headers: req.headers, limits: { files: 2, fileSize: 15 * 1024 * 1024 + 1, fields: 20, fieldSize: 10_000 } });
            bb.on('field', (name, value) => {
                fields[name] = value;
            });
            bb.on('file', (name, stream, info) => {
                if (name !== 'manuscript' && name !== 'coverLetter') {
                    stream.resume();
                    return;
                }
                const chunks = [];
                let truncated = false;
                stream.on('data', (c) => chunks.push(c));
                stream.on('limit', () => (truncated = true));
                stream.on('end', () => {
                    files[name] = { name: info.filename ?? 'file', data: Buffer.concat(chunks), truncated };
                });
            });
            bb.on('error', reject);
            bb.on('close', resolve);
            bb.end(req.rawBody);
        });
        const parsed = (0, submission_1.validateSubmissionFields)(fields);
        const errors = parsed.ok ? [] : [...parsed.errors];
        const stored = [];
        const id = db.collection('submissions').doc().id;
        const toStore = [];
        if (!files['manuscript'])
            errors.push('The manuscript file is required.');
        for (const kind of ['manuscript', 'coverLetter']) {
            const f = files[kind];
            if (!f)
                continue;
            const v = f.truncated ? { ok: false, error: `The ${kind === 'manuscript' ? 'manuscript' : 'cover letter'} file is too large.` } : (0, submission_1.validateFile)(kind, f.name, f.data);
            if (!v.ok)
                errors.push(v.error);
            else
                toStore.push({ kind, ext: v.ext, contentType: v.contentType, data: f.data, name: (0, submission_1.safeDisplayName)(f.name) });
        }
        if (errors.length || !parsed.ok)
            return fail(400, errors);
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
        const to = NOTIFY_EMAIL_TO.value();
        if (to) {
            await (0, email_1.sendEmail)(RESEND_API_KEY.value(), (0, email_1.buildSubmissionEmail)({ id, name: parsed.value.name, email: parsed.value.email, affiliation: parsed.value.affiliation, title: parsed.value.title, keywords: parsed.value.keywords, files: stored }, NOTIFY_EMAIL_FROM.value(), to, `${SITE_ORIGIN}/admin`));
        }
        res.status(200).json({ id });
    }
    catch (e) {
        console.error('submitManuscript error', e);
        fail(500, 'Something went wrong while saving your submission. Please try again or email the editor.');
    }
});
//# sourceMappingURL=index.js.map