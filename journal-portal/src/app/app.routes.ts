import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { DEFAULT_SEO, RouteSeoData } from './route-seo.data';

const seo = (
  overrides: Partial<RouteSeoData> & Pick<RouteSeoData, 'title'>
): { seo: RouteSeoData } => ({
  seo: { ...DEFAULT_SEO, ...overrides },
});

export const routes: Routes = [
  { path: '', loadComponent: () => import('./components/home/home.component').then((m) => m.HomeComponent), data: seo({ title: DEFAULT_SEO.title }) },
  {
    path: 'journals',
    loadComponent: () => import('./components/journals/journals.component').then((m) => m.JournalsComponent),
    data: seo({
      title: 'Journal issues | IJDR',
      description:
        'Browse volumes and issues of the Indian Journal of Development Research. View and download peer-reviewed journal PDFs.',
    }),
  },
  { path: 'journal/:id', loadComponent: () => import('./components/pdf-viewer/pdf-viewer.component').then((m) => m.PdfViewerComponent) },
  {
    path: 'articles',
    loadComponent: () => import('./components/articles/articles.component').then((m) => m.ArticlesComponent),
    data: seo({
      title: 'Articles | IJDR',
      description:
        'Browse research articles from the Indian Journal of Development Research by year, issue, author, keyword and subject.',
    }),
  },
  { path: 'article/:id', loadComponent: () => import('./components/article-detail/article-detail.component').then((m) => m.ArticleDetailComponent) },
  {
    path: 'about',
    loadComponent: () => import('./components/about/about.component').then((m) => m.AboutComponent),
    data: seo({
      title: 'About IJDR',
      description:
        'About the Indian Journal of Development Research — scope, publisher Institute of Development Studies Varanasi, and mission.',
    }),
  },
  {
    path: 'editorial-board',
    loadComponent: () => import('./components/editorial-board/editorial-board.component').then((m) => m.EditorialBoardComponent),
    data: seo({
      title: 'Editorial board | IJDR',
      description:
        'Editorial board members of the Indian Journal of Development Research.',
    }),
  },
  {
    path: 'advisory-board',
    loadComponent: () => import('./components/advisory-board/advisory-board.component').then((m) => m.AdvisoryBoardComponent),
    data: seo({
      title: 'Advisory board | IJDR',
      description:
        'Advisory board of the Indian Journal of Development Research.',
    }),
  },
  {
    path: 'publisher',
    loadComponent: () => import('./components/publisher/publisher.component').then((m) => m.PublisherComponent),
    data: seo({
      title: 'Publisher | IJDR',
      description:
        'Publisher information for the Indian Journal of Development Research.',
    }),
  },
  {
    path: 'contact',
    loadComponent: () => import('./components/contact/contact.component').then((m) => m.ContactComponent),
    data: seo({
      title: 'Contact | IJDR',
      description:
        'Contact the Indian Journal of Development Research — editorial office, address in Varanasi, phone and email.',
    }),
  },
  {
    path: 'contribute',
    loadComponent: () => import('./components/contribute/contribute.component').then((m) => m.ContributeComponent),
    data: seo({
      title: 'Contributor guidelines | IJDR',
      description:
        'Submission guidelines for authors: manuscript format, peer review, ethics, and how to submit to IJDR.',
    }),
  },
  {
    path: 'login',
    loadComponent: () => import('./components/auth/login/login.component').then((m) => m.LoginComponent),
    data: seo({
      title: 'Admin sign in | IJDR',
      description: 'Sign in to the IJDR journal administration portal.',
    }),
  },
  {
    path: 'admin',
    loadComponent: () => import('./components/admin/admin.component').then((m) => m.AdminComponent),
    canActivate: [AuthGuard],
    data: seo({
      title: 'Admin | IJDR',
      description: 'IJDR journal administration — manage issues and editorial board.',
    }),
  },
  {
    path: 'legal/privacy',
    loadComponent: () => import('./components/legal/privacy-policy/privacy-policy.component').then((m) => m.PrivacyPolicyComponent),
    data: seo({
      title: 'Privacy policy | IJDR',
      description: 'Privacy policy for the Indian Journal of Development Research website.',
    }),
  },
  {
    path: 'legal/terms',
    loadComponent: () => import('./components/legal/terms-of-service/terms-of-service.component').then((m) => m.TermsOfServiceComponent),
    data: seo({
      title: 'Terms of service | IJDR',
      description: 'Terms of service for using the Indian Journal of Development Research website.',
    }),
  },
  {
    path: 'legal/copyright',
    loadComponent: () => import('./components/legal/copyright/copyright.component').then((m) => m.CopyrightComponent),
    data: seo({
      title: 'Copyright | IJDR',
      description: 'Copyright information for the Indian Journal of Development Research.',
    }),
  },
  {
    path: 'legal/open-access',
    loadComponent: () => import('./components/legal/open-access/open-access.component').then((m) => m.OpenAccessComponent),
    data: seo({
      title: 'Open access | IJDR',
      description: 'Open access policy of the Indian Journal of Development Research.',
    }),
  },
  {
    path: 'legal/accessibility',
    loadComponent: () => import('./components/legal/accessibility/accessibility.component').then((m) => m.AccessibilityComponent),
    data: seo({
      title: 'Accessibility | IJDR',
      description: 'Accessibility statement for the Indian Journal of Development Research website.',
    }),
  },
  {
    path: '**',
    loadComponent: () => import('./components/page-not-found/page-not-found.component').then((m) => m.PageNotFoundComponent),
    data: seo({
      title: 'Page not found | IJDR',
      description: 'The requested page could not be found.',
    }),
  },
];
