"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateIngestResponse = validateIngestResponse;
exports.planReplacement = planReplacement;
exports.dropDuplicatesOfKept = dropDuplicatesOfKept;
const MAX_ARTICLES = 200;
const MAX_TITLE = 500;
const MAX_ABSTRACT = 8000;
function str(v, max) {
    if (typeof v !== 'string')
        return undefined;
    const t = v.trim().replace(/\s+\n/g, '\n');
    return t ? t.slice(0, max) : undefined;
}
function int(v) {
    return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : undefined;
}
/**
 * Validate Gemini's JSON. Never throws on a bad article: it is dropped or its
 * page range cleared, with a warning. Throws only if the payload is unusable.
 */
function validateIngestResponse(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.articles)) {
        throw new Error('The model returned an unexpected response shape.');
    }
    const r = raw;
    const warnings = [];
    const pageOffset = int(r.pageOffset) ?? 0;
    const total = int(r.totalPdfPages);
    const totalPdfPages = total && total > 0 ? total : undefined;
    const articles = [];
    if (r.articles.length > MAX_ARTICLES) {
        warnings.push(`Response had ${r.articles.length} articles; kept the first ${MAX_ARTICLES}.`);
    }
    r.articles.slice(0, MAX_ARTICLES).forEach((item, idx) => {
        const a = (item ?? {});
        const title = str(a['title'], MAX_TITLE);
        if (!title) {
            warnings.push(`Article ${idx + 1} dropped: no title.`);
            return;
        }
        const authors = (Array.isArray(a['authors']) ? a['authors'] : [])
            .map((x) => ({ name: str(x?.name, 200), affiliation: str(x?.affiliation, 300) }))
            .filter((x) => !!x.name)
            .map((x) => (x.affiliation ? { name: x.name, affiliation: x.affiliation } : { name: x.name }));
        const keywords = (Array.isArray(a['keywords']) ? a['keywords'] : [])
            .map((k) => str(k, 100))
            .filter((k) => !!k)
            .slice(0, 20);
        const draft = { title, authors, keywords };
        const abstract = str(a['abstract'], MAX_ABSTRACT);
        if (abstract)
            draft.abstract = abstract;
        const subject = str(a['subject'], 200);
        if (subject)
            draft.subject = subject;
        if (a['language'] === 'en' || a['language'] === 'hi')
            draft.language = a['language'];
        const conf = typeof a['confidence'] === 'number' ? a['confidence'] : undefined;
        if (conf !== undefined && Number.isFinite(conf))
            draft.confidence = Math.min(1, Math.max(0, conf));
        const ps = int(a['pageStart']);
        const pe = int(a['pageEnd']) ?? ps;
        if (ps !== undefined && pe !== undefined) {
            const start = ps + pageOffset;
            const end = pe + pageOffset;
            if (start >= 1 && end >= start && (!totalPdfPages || end <= totalPdfPages)) {
                draft.pageStart = start;
                draft.pageEnd = end;
            }
            else {
                warnings.push(`"${title.slice(0, 60)}": page range ${ps}-${pe} is out of range; cleared.`);
            }
        }
        articles.push(draft);
    });
    if (!articles.length) {
        throw new Error('No articles were found in the PDF.');
    }
    return { articles, pageOffset, totalPdfPages, warnings };
}
/**
 * Idempotency: re-running replaces only untouched AI drafts. Published articles,
 * manual articles and AI drafts an admin has edited are kept.
 */
function planReplacement(existing) {
    const deleteIds = [];
    let maxKeptOrder = 0;
    let keptCount = 0;
    for (const e of existing) {
        const replaceable = e.source === 'ai' && e.status === 'draft' && !e.humanEdited;
        if (replaceable) {
            deleteIds.push(e.id);
        }
        else {
            keptCount++;
            maxKeptOrder = Math.max(maxKeptOrder, e.order ?? 0);
        }
    }
    return { deleteIds, keptCount, nextOrder: maxKeptOrder + 1 };
}
/** Drop drafts whose title duplicates a kept article, so re-runs don't double up. */
function dropDuplicatesOfKept(drafts, keptTitles) {
    const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const kept = new Set(keptTitles.map(norm));
    const out = drafts.filter((d) => !kept.has(norm(d.title)));
    return { drafts: out, skipped: drafts.length - out.length };
}
//# sourceMappingURL=validate.js.map