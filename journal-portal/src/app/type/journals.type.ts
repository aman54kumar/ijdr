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
  createdAt?: any;
  updatedAt?: any;
}
