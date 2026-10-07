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
exports.rssFeed = exports.sitemap = exports.getPdf = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
admin.initializeApp();
const SITE_ORIGIN = process.env.SITEMAP_SITE_ORIGIN || 'https://ijdrpub.in';
const STATIC_PATHS = [
    '/',
    '/journals',
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
        const channelTitle = 'Indian Journal of Development Research — New issues';
        const body = `<?xml version="1.0" encoding="UTF-8"?>` +
            `<rss version="2.0"><channel>` +
            `<title>${xmlEscape(channelTitle)}</title>` +
            `<link>${xmlEscape(SITE_ORIGIN)}</link>` +
            `<description>${xmlEscape('New issues of IJDR (IJDRpub.in)')}</description>` +
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
//# sourceMappingURL=index.js.map