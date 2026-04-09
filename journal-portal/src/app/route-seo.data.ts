/** Route `data.seo` for document title and meta description (see AppComponent). */
export interface RouteSeoData {
  title: string;
  description: string;
}

export const DEFAULT_SEO: RouteSeoData = {
  title: 'IJDR - Indian Journal of Development Research',
  description:
    'Indian Journal of Development Research (IJDR) — a bi-annual academic journal published by the Institute of Development Studies, Varanasi. Peer-reviewed research in development studies. ISSN: 2249-104X.',
};
