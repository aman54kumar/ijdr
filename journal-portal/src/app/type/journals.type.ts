export interface GetJournalsResponse {
  data: { journals: iJournal[] };
}

export interface GetJournalByIdResponse {
  journal: iJournal;
}

export interface iArticle {
  id: number;
  articleNumber: number;
  authors: string;
  abstract: string;
  pdfUrl: string;
  journal: number;
  title: string;
  tags: { id: string; name: string };
}

export interface iJournal {
  id: number;
  volume: number;
  number: number;
  edition: string;
  ssn: string;
  articles: iArticle[];
}
