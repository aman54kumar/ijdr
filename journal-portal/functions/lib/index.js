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
Object.defineProperty(exports, "__esModule", { value: true });
exports.articlePage = exports.ingestIssue = exports.rssFeed = exports.sitemap = exports.getPdf = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const run_1 = require("./ingest/run");
const article_seo_1 = require("./article-seo");
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
//# sourceMappingURL=index.js.map