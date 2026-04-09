import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

const SITE_ORIGIN =
  process.env.SITEMAP_SITE_ORIGIN || 'https://ijdrpub.in';

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

    const journalId = req.path.split('/').pop();

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

    res.set('Content-Type', 'application/pdf');
    const disposition =
      req.query.disposition === 'attachment' ? 'attachment' : 'inline';
    res.set(
      'Content-Disposition',
      `${disposition}; filename="${sanitizeFilename(
        journalData.title || 'journal'
      )}.pdf"`
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

    const channelTitle = 'Indian Journal of Development Research — New issues';
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<rss version="2.0"><channel>` +
      `<title>${xmlEscape(channelTitle)}</title>` +
      `<link>${xmlEscape(SITE_ORIGIN)}</link>` +
      `<description>${xmlEscape(
        'New issues of IJDR (IJDRpub.in)'
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

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-z0-9\s\-_\.]/gi, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
}
