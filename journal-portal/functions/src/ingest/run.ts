import { GoogleGenAI, type GenerateContentResponseUsageMetadata } from '@google/genai';
import type { Bucket } from '@google-cloud/storage';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { INGEST_PROMPT, INGEST_PROMPT_VERSION, INGEST_RESPONSE_SCHEMA } from '../prompts/ingest';
import { buildSearchTokens } from './tokens';
import {
  dropDuplicatesOfKept,
  planReplacement,
  validateIngestResponse,
  type ExistingArticle,
} from './validate';

/** Flash-class model; override with the GEMINI_MODEL env var. Check Google's docs for the current free-tier name. */
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
export const MAX_PDF_BYTES = 100 * 1024 * 1024;
export const DAILY_INGEST_CAP = 10;
const LOCK_STALE_MS = 15 * 60 * 1000;
const FILE_ACTIVE_TIMEOUT_MS = 3 * 60 * 1000;
const BATCH_LIMIT = 400;

export type IngestErrorCode =
  | 'not-found'
  | 'already-exists'
  | 'resource-exhausted'
  | 'failed-precondition'
  | 'internal';

/** An error whose message is safe and useful to show to an admin. */
export class IngestError extends Error {
  constructor(public code: IngestErrorCode, message: string) {
    super(message);
  }
}

export interface IngestOptions {
  db: Firestore;
  bucket: Bucket;
  apiKey: string;
  issueId: string;
  model?: string;
  dailyCap?: number;
  log?: (msg: string) => void;
}

export interface IngestResult {
  created: number;
  kept: number;
  replaced: number;
  warnings: string[];
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isRetryable(e: unknown): boolean {
  const msg = String((e as any)?.message ?? e);
  const status = (e as any)?.status ?? (e as any)?.code;
  return (
    status === 429 || status === 503 || status === 500 ||
    /\b(429|503|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded)\b/i.test(msg)
  );
}

function explainGeminiError(e: unknown): IngestError {
  const msg = String((e as any)?.message ?? e);
  if (/RESOURCE_EXHAUSTED|\b429\b/.test(msg)) {
    return new IngestError('resource-exhausted', 'Gemini quota or rate limit reached. Wait a while (or until tomorrow for the daily limit) and try again.');
  }
  if (/fetch failed|TIMEOUT|timed out|ECONNRESET/i.test(msg)) {
    return new IngestError('internal', 'The connection to Gemini timed out. Try again; if it repeats, the issue may be too large for one request.');
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

async function withBackoff<T>(fn: () => Promise<T>, log: (m: string) => void): Promise<T> {
  const delays = [5000, 20000, 60000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= delays.length || !isRetryable(e)) throw e;
      log(`Retryable Gemini error (attempt ${attempt + 1}); waiting ${delays[attempt] / 1000}s`);
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
  }
}

async function acquireLock(db: Firestore, issueId: string, model: string, dailyCap: number) {
  const jobRef = db.collection('ingestJobs').doc(issueId);
  const statsRef = db.collection('ingestStats').doc(today());
  await db.runTransaction(async (tx) => {
    const [job, stats] = await Promise.all([tx.get(jobRef), tx.get(statsRef)]);
    const j = job.data();
    if (j?.state === 'running') {
      const started: Timestamp | undefined = j.startedAt;
      if (started && Date.now() - started.toMillis() < LOCK_STALE_MS) {
        throw new IngestError('already-exists', 'An extraction for this issue is already running.');
      }
    }
    const count = (stats.data()?.count as number | undefined) ?? 0;
    if (count >= dailyCap) {
      throw new IngestError('resource-exhausted', `Daily extraction limit (${dailyCap}) reached. Try again tomorrow.`);
    }
    tx.set(statsRef, { count: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(jobRef, {
      issueId,
      state: 'running',
      model,
      promptVersion: INGEST_PROMPT_VERSION,
      startedAt: FieldValue.serverTimestamp(),
      finishedAt: null,
      error: null,
      result: null,
      usage: null,
    });
  });
  return jobRef;
}

function storagePath(journal: FirebaseFirestore.DocumentData, issueId: string): string {
  // Uploads use a fixed object name (see FirebaseJournalService.uploadJournalPDF).
  const fixed = `journals/${issueId}/issue.pdf`;
  const url = journal['pdfUrl'] as string | undefined;
  if (url) {
    try {
      const parts = new URL(url).pathname.split('/');
      const o = parts.indexOf('o');
      if (o !== -1 && o < parts.length - 1) {
        return decodeURIComponent(parts.slice(o + 1).join('/'));
      }
    } catch {
      /* fall through */
    }
  }
  return fixed;
}

export async function runIngest(opts: IngestOptions): Promise<IngestResult> {
  const { db, bucket, apiKey, issueId } = opts;
  const model = opts.model || DEFAULT_GEMINI_MODEL;
  const log = opts.log ?? ((m: string) => console.log(`[ingest ${issueId}] ${m}`));

  const journalSnap = await db.collection('journals').doc(issueId).get();
  if (!journalSnap.exists) {
    throw new IngestError('not-found', 'Issue not found.');
  }
  const journal = journalSnap.data()!;
  const file = bucket.file(storagePath(journal, issueId));
  const [exists] = await file.exists();
  if (!exists) {
    throw new IngestError('not-found', 'This issue has no PDF in storage.');
  }
  const [meta] = await file.getMetadata();
  const size = Number(meta.size ?? 0);
  if (size > MAX_PDF_BYTES) {
    throw new IngestError('failed-precondition', `The PDF is ${(size / 1048576).toFixed(0)} MB; the limit is ${MAX_PDF_BYTES / 1048576} MB.`);
  }

  const jobRef = await acquireLock(db, issueId, model, opts.dailyCap ?? DAILY_INGEST_CAP);
  const ai = new GoogleGenAI({ apiKey });
  const tmp = path.join(os.tmpdir(), `ingest-${issueId}-${Date.now()}.pdf`);
  let uploadedName: string | undefined;

  try {
    log(`Downloading ${size} bytes`);
    await file.download({ destination: tmp });

    log('Uploading to Gemini Files API');
    let uploaded = await withBackoff(
      () => ai.files.upload({ file: tmp, config: { mimeType: 'application/pdf', displayName: `issue-${issueId}` } }),
      log
    );
    uploadedName = uploaded.name;
    const deadline = Date.now() + FILE_ACTIVE_TIMEOUT_MS;
    while (uploaded.state === 'PROCESSING') {
      if (Date.now() > deadline) {
        throw new IngestError('internal', 'Gemini took too long to process the PDF. Try again.');
      }
      await new Promise((r) => setTimeout(r, 3000));
      uploaded = await ai.files.get({ name: uploadedName! });
    }
    if (uploaded.state === 'FAILED' || !uploaded.uri) {
      throw new IngestError('failed-precondition', 'Gemini could not process this PDF.');
    }

    log(`Generating with ${model}`);
    // Stream the answer: a non-streaming call sends no headers until the whole
    // (long) answer is ready and trips Node's 5-minute headers timeout.
    const { text, usage, finishReason } = await withBackoff(async () => {
      const stream = await ai.models.generateContentStream({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { fileData: { fileUri: uploaded.uri!, mimeType: 'application/pdf' } },
              { text: INGEST_PROMPT },
            ],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: INGEST_RESPONSE_SCHEMA,
          temperature: 0,
          maxOutputTokens: 32768,
        },
      });
      let out = '';
      let usageMeta: GenerateContentResponseUsageMetadata | undefined;
      let reason: string | undefined;
      for await (const chunk of stream) {
        out += chunk.text ?? '';
        usageMeta = chunk.usageMetadata ?? usageMeta;
        reason = chunk.candidates?.[0]?.finishReason ?? reason;
      }
      return { text: out, usage: usageMeta, finishReason: reason };
    }, log);

    if (!text) {
      throw new IngestError('internal', 'Gemini returned an empty response (it may have been blocked or truncated).');
    }
    if (finishReason === 'MAX_TOKENS') {
      throw new IngestError('internal', 'Gemini ran out of output space for this issue and the list was cut off. Try again, or split the issue.');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new IngestError('internal', 'Gemini returned malformed JSON (the output may have been truncated). Try again.');
    }
    const validated = validateIngestResponse(parsed);

    // Replace untouched AI drafts only.
    const existingSnap = await db.collection('articles').where('issueId', '==', issueId).get();
    const existing: (ExistingArticle & { title?: string })[] = existingSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as object),
    }));
    const plan = planReplacement(existing);
    const keptTitles = existing.filter((e) => !plan.deleteIds.includes(e.id)).map((e) => String(e.title ?? ''));
    const { drafts, skipped } = dropDuplicatesOfKept(validated.articles, keptTitles);
    const warnings = [...validated.warnings];
    if (skipped) warnings.push(`${skipped} article(s) skipped because a published or edited article has the same title.`);

    const ops: ((b: FirebaseFirestore.WriteBatch) => void)[] = [];
    for (const id of plan.deleteIds) {
      ops.push((b) => b.delete(db.collection('articles').doc(id)));
    }
    drafts.forEach((d, i) => {
      const ref = db.collection('articles').doc();
      const data: Record<string, unknown> = {
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
        searchTokens: buildSearchTokens(d),
        viewCount: 0,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        aiModel: model,
        aiPromptVersion: INGEST_PROMPT_VERSION,
      };
      for (const k of ['abstract', 'subject', 'pageStart', 'pageEnd', 'language'] as const) {
        if (d[k] !== undefined) data[k] = d[k];
      }
      if (d.confidence !== undefined) data['aiConfidence'] = d.confidence;
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
      updatedAt: FieldValue.serverTimestamp(),
    });

    const result: IngestResult = { created: drafts.length, kept: plan.keptCount, replaced: plan.deleteIds.length, warnings };
    await jobRef.update({
      state: 'done',
      finishedAt: FieldValue.serverTimestamp(),
      result,
      usage: {
        promptTokens: usage?.promptTokenCount ?? null,
        outputTokens: usage?.candidatesTokenCount ?? null,
        totalTokens: usage?.totalTokenCount ?? null,
      },
    });
    log(`Done: ${drafts.length} drafts`);
    return result;
  } catch (e) {
    const err = e instanceof IngestError ? e : explainGeminiError(e);
    if (!(e instanceof IngestError)) console.error(`[ingest ${issueId}]`, e);
    await jobRef.update({ state: 'error', finishedAt: FieldValue.serverTimestamp(), error: err.message });
    throw err;
  } finally {
    fs.rm(tmp, { force: true }, () => undefined);
    if (uploadedName) {
      ai.files.delete({ name: uploadedName }).catch(() => undefined);
    }
  }
}
