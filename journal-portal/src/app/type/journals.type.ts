export interface GetJournalsResponse {
  data: { journals: iJournal[] };
}

export interface GetJournalByIdResponse {
  journal: iJournal;
}

export interface iJournal {
  id: string;
  title: string;
  edition?: 'January-June' | 'July-December'; // Optional for backward compatibility
  volume: number;
  number: number;
  year: string;
  description?: string;
  ssn?: string; // ISSN
  pdfUrl: string;
  pdfFileName?: string;
  fileSize?: number;
  viewCount?: number; // Real view tracking
  coverUrl?: string; // First-page thumbnail in Storage (journals/covers/{id}.jpg)
  articleCount?: number; // Maintained by ArticleService (all statuses)
  articlesStatus?: 'none' | 'draft' | 'published'; // published = at least one published article
  createdAt?: any; // Timestamp
  updatedAt?: any; // Timestamp
}

export interface BoardMember {
  id: string;
  name: string;
  position:
    | 'Chief Editor'
    | 'Associate Editor'
    | 'Editorial Board Member'
    | 'Advisory Board Member'
    | 'Patron';
  affiliation?: string;
  bio?: string | string[];
  bioContentType?: 'text' | 'list';
  email?: string;
  phone?: string;
  imageUrl?: string;
  order: number; // for sorting within position group
  isActive: boolean;
  dynamicSections: BoardMemberSection[];
  createdAt?: any; // Timestamp
  updatedAt?: any; // Timestamp
}

export interface BoardMemberSection {
  id: string;
  heading: string;
  contentType: 'text' | 'list'; // either single text or bullet points
  content: string | string[]; // can be a single string or array for bullet points
  order: number; // for section ordering
}

export interface FirebaseBoardMember {
  id: string;
  name: string;
  position: string;
  affiliation?: string;
  bio?: string | string[];
  bioContentType?: string;
  email?: string;
  phone?: string;
  imageUrl?: string;
  order: number;
  isActive: boolean;
  dynamicSections: {
    id: string;
    heading: string;
    contentType: string;
    content: string | string[];
    order: number;
  }[];
  createdAt?: any;
  updatedAt?: any;
}

/** `siteSettings/announcement` */
export interface Announcement {
  enabled: boolean;
  text: string;
  linkUrl?: string;
  linkLabel?: string;
  updatedAt?: any;
}

export interface iArticleAuthor {
  name: string;
  affiliation?: string;
  email?: string;
  orcid?: string;
}

/** `articles/{id}`. Public read only when `status === 'published'`. */
export interface iArticle {
  id: string;
  issueId: string; // journals/{id}
  title: string;
  authors: iArticleAuthor[];
  abstract?: string;
  keywords: string[];
  subject?: string;
  pageStart?: number; // page in the issue PDF
  pageEnd?: number;
  doi?: string;
  language?: 'en' | 'hi';
  status: 'draft' | 'published';
  source: 'manual' | 'ai';
  order: number; // order within the issue
  // Denormalized from the issue for listing and search
  issueVolume: number;
  issueNumber: number;
  issueYear: string;
  issueTitle: string;
  searchTokens?: string[];
  viewCount?: number;
  // AI ingest provenance (Phase 3)
  aiConfidence?: number; // 0-1, model's own estimate
  aiModel?: string;
  aiPromptVersion?: string;
  humanEdited?: boolean; // set when an admin edits an AI draft; re-ingest then keeps it
  createdAt?: any;
  updatedAt?: any;
}

/** `ingestJobs/{issueId}` (admin only). */
export interface IngestJob {
  issueId: string;
  state: 'running' | 'done' | 'error';
  model?: string;
  promptVersion?: string;
  startedAt?: any;
  finishedAt?: any;
  error?: string | null;
  result?: { created: number; kept: number; replaced: number; warnings: string[] } | null;
  usage?: { promptTokens: number | null; outputTokens: number | null; totalTokens: number | null } | null;
}

/** `siteSettings/ai`: admin kill switches, read by the UI and by the functions. Missing = all off. */
export interface AiSettings {
  summaries: boolean;
  translation: boolean;
  chat: boolean;
  semanticSearch: boolean;
  contactTriage: boolean;
}

/** `articles/{id}/ai/summary` */
export interface AiSummary {
  text: string;
  keyPoints: string[];
  model?: string;
  promptVersion?: string;
  hidden?: boolean;
  generatedAt?: any;
}

/** `articles/{id}/ai/translation_hi` */
export interface AiTranslation {
  title: string;
  abstract: string | null;
  summary: string | null;
  keyPoints: string[];
  model?: string;
}

export interface ChatReply {
  answerable: boolean;
  answer: string;
  pages: number[];
}

export interface SemanticHit {
  id: string;
  title: string;
  authors: string[];
  issueYear: string;
  score: number;
}

export type SubmissionStatus = 'received' | 'under_review' | 'revision' | 'accepted' | 'rejected';

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  received: 'Received',
  under_review: 'Under review',
  revision: 'Revision requested',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

/** `submissions/{id}` (admin only; created by the submitManuscript function). */
export interface Submission {
  id: string;
  name: string;
  email: string;
  affiliation: string;
  phone?: string;
  title: string;
  abstract: string;
  keywords: string[];
  note?: string;
  status: SubmissionStatus;
  files: { kind: 'manuscript' | 'coverLetter'; path: string; name: string; size: number; contentType: string }[];
  history: { status: SubmissionStatus; at: any; by: string }[];
  notes: { text: string; at: any; by: string }[];
  createdAt?: any;
  updatedAt?: any;
}

/** `auditLog/{id}` */
export interface AuditEntry {
  id?: string;
  action: string; // e.g. article.publish, article.delete, issue.delete, submission.status
  targetType: 'article' | 'issue' | 'submission';
  targetId: string;
  title?: string;
  detail?: string;
  actorUid: string;
  actorEmail?: string;
  at: any;
}

/** `statsDaily/{yyyy-mm-dd}` */
export interface DailyStats {
  date: string;
  issues: Record<string, { title: string; views: number }>;
  articles: Record<string, { title: string; views: number }>;
  totals: { issueViews: number; articleViews: number; contacts: number; submissions: number; articlesPublished: number };
  ai: Record<string, number>;
}
