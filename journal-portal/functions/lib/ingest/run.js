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
exports.IngestError = exports.DAILY_INGEST_CAP = exports.MAX_PDF_BYTES = exports.DEFAULT_GEMINI_MODEL = void 0;
exports.runIngest = runIngest;
const genai_1 = require("@google/genai");
const firestore_1 = require("firebase-admin/firestore");
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const ingest_1 = require("../prompts/ingest");
const tokens_1 = require("./tokens");
const validate_1 = require("./validate");
/** Flash-class model; override with the GEMINI_MODEL env var. Check Google's docs for the current free-tier name. */
exports.DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
exports.MAX_PDF_BYTES = 100 * 1024 * 1024;
exports.DAILY_INGEST_CAP = 10;
const LOCK_STALE_MS = 15 * 60 * 1000;
const FILE_ACTIVE_TIMEOUT_MS = 3 * 60 * 1000;
const BATCH_LIMIT = 400;
/** An error whose message is safe and useful to show to an admin. */
class IngestError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
exports.IngestError = IngestError;
function today() {
    return new Date().toISOString().slice(0, 10);
}
function isRetryable(e) {
    const msg = String(e?.message ?? e);
    const status = e?.status ?? e?.code;
    return (status === 429 || status === 503 || status === 500 ||
        /\b(429|503|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded)\b/i.test(msg));
}
function explainGeminiError(e) {
    const msg = String(e?.message ?? e);
    if (/RESOURCE_EXHAUSTED|\b429\b/.test(msg)) {
        return new IngestError('resource-exhausted', 'Gemini quota or rate limit reached. Wait a while (or until tomorrow for the daily limit) and try again.');
    }
    if (/UNAVAILABLE|\b503\b|overloaded/i.test(msg)) {
        return new IngestError('internal', 'Gemini is temporarily overloaded. Try again in a few minutes.');
    }
    if (/API key|PERMISSION_DENIED|\b40[13]\b/i.test(msg)) {
        return new IngestError('failed-precondition', 'Gemini rejected the API key. Check the GEMINI_API_KEY secret.');
    }
    if (/NOT_FOUND|\b404\b/.test(msg) && /model/i.test(msg)) {
        return new IngestError('failed-precondition', 'The configured Gemini model was not found. Set GEMINI_MODEL to a current Flash model.');
    }
    if (/INVALID_ARGUMENT|\b400\b/.test(msg)) {
        return new IngestError('failed-precondition', 'Gemini could not read this PDF (invalid or too large for the model).');
    }
    return new IngestError('internal', 'Gemini request failed. See the function logs for details.');
}
async function withBackoff(fn, log) {
    const delays = [5000, 20000, 60000];
    for (let attempt = 0;; attempt++) {
        try {
            return await fn();
        }
        catch (e) {
            if (attempt >= delays.length || !isRetryable(e))
                throw e;
            log(`Retryable Gemini error (attempt ${attempt + 1}); waiting ${delays[attempt] / 1000}s`);
            await new Promise((r) => setTimeout(r, delays[attempt]));
        }
    }
}
async function acquireLock(db, issueId, model, dailyCap) {
    const jobRef = db.collection('ingestJobs').doc(issueId);
    const statsRef = db.collection('ingestStats').doc(today());
    await db.runTransaction(async (tx) => {
        const [job, stats] = await Promise.all([tx.get(jobRef), tx.get(statsRef)]);
        const j = job.data();
        if (j?.state === 'running') {
            const started = j.startedAt;
            if (started && Date.now() - started.toMillis() < LOCK_STALE_MS) {
                throw new IngestError('already-exists', 'An extraction for this issue is already running.');
            }
        }
        const count = stats.data()?.count ?? 0;
        if (count >= dailyCap) {
            throw new IngestError('resource-exhausted', `Daily extraction limit (${dailyCap}) reached. Try again tomorrow.`);
        }
        tx.set(statsRef, { count: count + 1, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
        tx.set(jobRef, {
            issueId,
            state: 'running',
            model,
            promptVersion: ingest_1.INGEST_PROMPT_VERSION,
            startedAt: firestore_1.FieldValue.serverTimestamp(),
            finishedAt: null,
            error: null,
            result: null,
            usage: null,
        });
    });
    return jobRef;
}
function storagePath(journal, issueId) {
    // Uploads use a fixed object name (see FirebaseJournalService.uploadJournalPDF).
    const fixed = `journals/${issueId}/issue.pdf`;
    const url = journal['pdfUrl'];
    if (url) {
        try {
            const parts = new URL(url).pathname.split('/');
            const o = parts.indexOf('o');
            if (o !== -1 && o < parts.length - 1) {
                return decodeURIComponent(parts.slice(o + 1).join('/'));
            }
        }
        catch {
            /* fall through */
        }
    }
    return fixed;
}
async function runIngest(opts) {
    const { db, bucket, apiKey, issueId } = opts;
    const model = opts.model || exports.DEFAULT_GEMINI_MODEL;
    const log = opts.log ?? ((m) => console.log(`[ingest ${issueId}] ${m}`));
    const journalSnap = await db.collection('journals').doc(issueId).get();
    if (!journalSnap.exists) {
        throw new IngestError('not-found', 'Issue not found.');
    }
    const journal = journalSnap.data();
    const file = bucket.file(storagePath(journal, issueId));
    const [exists] = await file.exists();
    if (!exists) {
        throw new IngestError('not-found', 'This issue has no PDF in storage.');
    }
    const [meta] = await file.getMetadata();
    const size = Number(meta.size ?? 0);
    if (size > exports.MAX_PDF_BYTES) {
        throw new IngestError('failed-precondition', `The PDF is ${(size / 1048576).toFixed(0)} MB; the limit is ${exports.MAX_PDF_BYTES / 1048576} MB.`);
    }
    const jobRef = await acquireLock(db, issueId, model, opts.dailyCap ?? exports.DAILY_INGEST_CAP);
    const ai = new genai_1.GoogleGenAI({ apiKey });
    const tmp = path.join(os.tmpdir(), `ingest-${issueId}-${Date.now()}.pdf`);
    let uploadedName;
    try {
        log(`Downloading ${size} bytes`);
        await file.download({ destination: tmp });
        log('Uploading to Gemini Files API');
        let uploaded = await withBackoff(() => ai.files.upload({ file: tmp, config: { mimeType: 'application/pdf', displayName: `issue-${issueId}` } }), log);
        uploadedName = uploaded.name;
        const deadline = Date.now() + FILE_ACTIVE_TIMEOUT_MS;
        while (uploaded.state === 'PROCESSING') {
            if (Date.now() > deadline) {
                throw new IngestError('internal', 'Gemini took too long to process the PDF. Try again.');
            }
            await new Promise((r) => setTimeout(r, 3000));
            uploaded = await ai.files.get({ name: uploadedName });
        }
        if (uploaded.state === 'FAILED' || !uploaded.uri) {
            throw new IngestError('failed-precondition', 'Gemini could not process this PDF.');
        }
        log(`Generating with ${model}`);
        const response = await withBackoff(() => ai.models.generateContent({
            model,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { fileData: { fileUri: uploaded.uri, mimeType: 'application/pdf' } },
                        { text: ingest_1.INGEST_PROMPT },
                    ],
                },
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: ingest_1.INGEST_RESPONSE_SCHEMA,
                temperature: 0,
                maxOutputTokens: 32768,
            },
        }), log);
        const text = response.text;
        if (!text) {
            throw new IngestError('internal', 'Gemini returned an empty response (it may have been blocked or truncated).');
        }
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch {
            throw new IngestError('internal', 'Gemini returned malformed JSON (the output may have been truncated). Try again.');
        }
        const validated = (0, validate_1.validateIngestResponse)(parsed);
        // Replace untouched AI drafts only.
        const existingSnap = await db.collection('articles').where('issueId', '==', issueId).get();
        const existing = existingSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
        }));
        const plan = (0, validate_1.planReplacement)(existing);
        const keptTitles = existing.filter((e) => !plan.deleteIds.includes(e.id)).map((e) => String(e.title ?? ''));
        const { drafts, skipped } = (0, validate_1.dropDuplicatesOfKept)(validated.articles, keptTitles);
        const warnings = [...validated.warnings];
        if (skipped)
            warnings.push(`${skipped} article(s) skipped because a published or edited article has the same title.`);
        const ops = [];
        for (const id of plan.deleteIds) {
            ops.push((b) => b.delete(db.collection('articles').doc(id)));
        }
        drafts.forEach((d, i) => {
            const ref = db.collection('articles').doc();
            const data = {
                issueId,
                title: d.title,
                authors: d.authors,
                keywords: d.keywords,
                status: 'draft',
                source: 'ai',
                order: plan.nextOrder + i,
                issueTitle: journal['title'],
                issueVolume: journal['volume'],
                issueNumber: journal['number'],
                issueYear: journal['year'],
                searchTokens: (0, tokens_1.buildSearchTokens)(d),
                viewCount: 0,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                aiModel: model,
                aiPromptVersion: ingest_1.INGEST_PROMPT_VERSION,
            };
            for (const k of ['abstract', 'subject', 'pageStart', 'pageEnd', 'language']) {
                if (d[k] !== undefined)
                    data[k] = d[k];
            }
            if (d.confidence !== undefined)
                data['aiConfidence'] = d.confidence;
            ops.push((b) => b.set(ref, data));
        });
        for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
            const batch = db.batch();
            ops.slice(i, i + BATCH_LIMIT).forEach((op) => op(batch));
            await batch.commit();
        }
        const total = plan.keptCount + drafts.length;
        const anyPublished = existing.some((e) => e.status === 'published' && !plan.deleteIds.includes(e.id));
        await db.collection('journals').doc(issueId).update({
            articleCount: total,
            articlesStatus: total === 0 ? 'none' : anyPublished ? 'published' : 'draft',
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        const usage = response.usageMetadata;
        const result = { created: drafts.length, kept: plan.keptCount, replaced: plan.deleteIds.length, warnings };
        await jobRef.update({
            state: 'done',
            finishedAt: firestore_1.FieldValue.serverTimestamp(),
            result,
            usage: {
                promptTokens: usage?.promptTokenCount ?? null,
                outputTokens: usage?.candidatesTokenCount ?? null,
                totalTokens: usage?.totalTokenCount ?? null,
            },
        });
        log(`Done: ${drafts.length} drafts`);
        return result;
    }
    catch (e) {
        const err = e instanceof IngestError ? e : explainGeminiError(e);
        if (!(e instanceof IngestError))
            console.error(`[ingest ${issueId}]`, e);
        await jobRef.update({ state: 'error', finishedAt: firestore_1.FieldValue.serverTimestamp(), error: err.message });
        throw err;
    }
    finally {
        fs.rm(tmp, { force: true }, () => undefined);
        if (uploadedName) {
            ai.files.delete({ name: uploadedName }).catch(() => undefined);
        }
    }
}
//# sourceMappingURL=run.js.map