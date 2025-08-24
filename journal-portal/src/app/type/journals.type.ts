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
