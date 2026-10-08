"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_QUESTION_CHARS = void 0;
exports.parseAiSettings = parseAiSettings;
exports.dayKey = dayKey;
exports.visitorKey = visitorKey;
exports.cleanQuestion = cleanQuestion;
exports.validateChat = validateChat;
exports.validateSummary = validateSummary;
exports.cosine = cosine;
exports.topK = topK;
exports.embeddingText = embeddingText;
// Pure helpers for the Phase 5 AI features (unit tested in ai.test.ts).
const node_crypto_1 = require("node:crypto");
/** Missing doc or non-true values mean OFF: nothing public runs until an admin switches it on. */
function parseAiSettings(raw) {
    const r = (raw ?? {});
    return {
        summaries: r['summaries'] === true,
        translation: r['translation'] === true,
        chat: r['chat'] === true,
        semanticSearch: r['semanticSearch'] === true,
    };
}
/** UTC day key, e.g. 2026-10-07. */
function dayKey(d = new Date()) {
    return d.toISOString().slice(0, 10);
}
/** Visitor key for rate limits: a salted hash, so raw IPs are never stored. */
function visitorKey(ip, salt) {
    return (0, node_crypto_1.createHash)('sha256').update(`${salt}|${ip ?? 'unknown'}`).digest('hex').slice(0, 24);
}
exports.MAX_QUESTION_CHARS = 400;
/** Trim, collapse whitespace, cap length. Returns null if nothing usable is left. */
function cleanQuestion(q) {
    if (typeof q !== 'string')
        return null;
    const t = q.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (t.length < 3)
        return null;
    return t.slice(0, exports.MAX_QUESTION_CHARS);
}
/**
 * Validate the model's chat JSON. `pageStart` is the file page of attachment page 1;
 * `pageCount` is the number of pages in the attachment. Out-of-range citations are dropped.
 * An "answerable" answer with no valid page citation is downgraded: we only show cited answers.
 */
function validateChat(raw, pageStart, pageCount) {
    const r = (raw ?? {});
    const answer = typeof r['answer'] === 'string' ? r['answer'].trim().slice(0, 1500) : '';
    const cited = (Array.isArray(r['pages']) ? r['pages'] : [])
        .filter((p) => Number.isInteger(p) && p >= 1 && p <= pageCount)
        .map((p) => pageStart + p - 1);
    const pages = [...new Set(cited)].sort((a, b) => a - b);
    if (r['answerable'] !== true || !answer || !pages.length) {
        return {
            answerable: false,
            answer: answer && r['answerable'] !== true ? answer : 'This article does not seem to answer that question.',
            pages: [],
        };
    }
    return { answerable: true, answer, pages };
}
function validateSummary(raw) {
    const r = (raw ?? {});
    const text = typeof r['text'] === 'string' ? r['text'].trim().slice(0, 2000) : '';
    const keyPoints = (Array.isArray(r['keyPoints']) ? r['keyPoints'] : [])
        .filter((k) => typeof k === 'string' && !!k.trim())
        .map((k) => k.trim().slice(0, 300))
        .slice(0, 6);
    if (!text) {
        throw new Error('empty-summary');
    }
    return { text, keyPoints };
}
function cosine(a, b) {
    let dot = 0;
    let na = 0;
    let nb = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
}
function topK(query, items, k, excludeId, minScore = 0.3) {
    return items
        .filter((i) => i.id !== excludeId)
        .map((i) => ({ id: i.id, score: cosine(query, i.vector) }))
        .filter((x) => x.score >= minScore)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
}
/** Text embedded for an article: title, abstract and keywords. */
function embeddingText(a) {
    return [a.title, a.abstract ?? '', (a.keywords ?? []).join(', ')].filter(Boolean).join('\n\n').slice(0, 6000);
}
//# sourceMappingURL=pure.js.map