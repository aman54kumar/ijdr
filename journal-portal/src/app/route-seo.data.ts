/** Route `data.seo` for document title and meta description (see AppComponent). */
export interface RouteSeoData {
  title: string;
  description: string;
}

export const DEFAULT_SEO: RouteSeoData = {
  title: 'IJDR - Indian Journal of Development Research',
  description:
    'Indian Journal of Development Research (IJDR): a peer-reviewed, open-access journal on development studies from the Institute of Development Studies, Varanasi.',
};
