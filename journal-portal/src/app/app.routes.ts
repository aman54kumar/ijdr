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
        'Meet the editorial board of the Indian Journal of Development Research: the editors and scholars who guide peer review and publication at IJDR.',
    }),
  },
  {
    path: 'advisory-board',
    loadComponent: () => import('./components/advisory-board/advisory-board.component').then((m) => m.AdvisoryBoardComponent),
    data: seo({
      title: 'Advisory board | IJDR',
      description:
        'Meet the advisory board of the Indian Journal of Development Research: senior scholars who advise on the journal\'s scope, quality and direction.',
    }),
  },
  {
    path: 'publisher',
    loadComponent: () => import('./components/publisher/publisher.component').then((m) => m.PublisherComponent),
    data: seo({
      title: 'Publisher | IJDR',
      description:
        'The Indian Journal of Development Research is published by the Institute of Development Studies, Varanasi. Publisher details and contact information.',
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
      description: 'How the Indian Journal of Development Research website collects, uses and protects personal data, including analytics, cookies and your rights.',
    }),
  },
  {
    path: 'legal/terms',
    loadComponent: () => import('./components/legal/terms-of-service/terms-of-service.component').then((m) => m.TermsOfServiceComponent),
    data: seo({
      title: 'Terms of service | IJDR',
      description: 'Terms of service for using the Indian Journal of Development Research website, including acceptable use, content licensing and liability.',
    }),
  },
  {
    path: 'legal/copyright',
    loadComponent: () => import('./components/legal/copyright/copyright.component').then((m) => m.CopyrightComponent),
    data: seo({
      title: 'Copyright | IJDR',
      description: 'Copyright and reuse information for the Indian Journal of Development Research: author rights, permitted use of articles and how to request permission.',
    }),
  },
  {
    path: 'legal/open-access',
    loadComponent: () => import('./components/legal/open-access/open-access.component').then((m) => m.OpenAccessComponent),
    data: seo({
      title: 'Open access | IJDR',
      description: 'IJDR is a free, open-access journal. Read how readers may access, download and share articles from the Indian Journal of Development Research.',
    }),
  },
  {
    path: 'legal/accessibility',
    loadComponent: () => import('./components/legal/accessibility/accessibility.component').then((m) => m.AccessibilityComponent),
    data: seo({
      title: 'Accessibility | IJDR',
      description: 'Accessibility statement for the Indian Journal of Development Research website: our WCAG 2.1 AA commitment, known limitations and how to report issues.',
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
