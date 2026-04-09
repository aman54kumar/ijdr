import { Routes } from '@angular/router';
import { JournalsComponent } from './components/journals/journals.component';
import { HomeComponent } from './components/home/home.component';
import { AdminComponent } from './components/admin/admin.component';
import { LoginComponent } from './components/auth/login/login.component';
import { PageNotFoundComponent } from './components/page-not-found/page-not-found.component';
import { EditorialBoardComponent } from './components/editorial-board/editorial-board.component';
import { ContributeComponent } from './components/contribute/contribute.component';
import { PdfViewerComponent } from './components/pdf-viewer/pdf-viewer.component';
import { AboutComponent } from './components/about/about.component';
import { AdvisoryBoardComponent } from './components/advisory-board/advisory-board.component';
import { PublisherComponent } from './components/publisher/publisher.component';
import { ContactComponent } from './components/contact/contact.component';
import { PrivacyPolicyComponent } from './components/legal/privacy-policy/privacy-policy.component';
import { TermsOfServiceComponent } from './components/legal/terms-of-service/terms-of-service.component';
import { CopyrightComponent } from './components/legal/copyright/copyright.component';
import { OpenAccessComponent } from './components/legal/open-access/open-access.component';
import { AccessibilityComponent } from './components/legal/accessibility/accessibility.component';
import { AuthGuard } from './guards/auth.guard';
import { DEFAULT_SEO, RouteSeoData } from './route-seo.data';

const seo = (
  overrides: Partial<RouteSeoData> & Pick<RouteSeoData, 'title'>
): { seo: RouteSeoData } => ({
  seo: { ...DEFAULT_SEO, ...overrides },
});

export const routes: Routes = [
  { path: '', component: HomeComponent, data: seo({ title: DEFAULT_SEO.title }) },
  {
    path: 'journals',
    component: JournalsComponent,
    data: seo({
      title: 'Journal issues | IJDR',
      description:
        'Browse volumes and issues of the Indian Journal of Development Research. View and download peer-reviewed journal PDFs.',
    }),
  },
  { path: 'journal/:id', component: PdfViewerComponent },
  {
    path: 'about',
    component: AboutComponent,
    data: seo({
      title: 'About IJDR',
      description:
        'About the Indian Journal of Development Research — scope, publisher Institute of Development Studies Varanasi, and mission.',
    }),
  },
  {
    path: 'editorial-board',
    component: EditorialBoardComponent,
    data: seo({
      title: 'Editorial board | IJDR',
      description:
        'Editorial board members of the Indian Journal of Development Research.',
    }),
  },
  {
    path: 'advisory-board',
    component: AdvisoryBoardComponent,
    data: seo({
      title: 'Advisory board | IJDR',
      description:
        'Advisory board of the Indian Journal of Development Research.',
    }),
  },
  {
    path: 'publisher',
    component: PublisherComponent,
    data: seo({
      title: 'Publisher | IJDR',
      description:
        'Publisher information for the Indian Journal of Development Research.',
    }),
  },
  {
    path: 'contact',
    component: ContactComponent,
    data: seo({
      title: 'Contact | IJDR',
      description:
        'Contact the Indian Journal of Development Research — editorial office, address in Varanasi, phone and email.',
    }),
  },
  {
    path: 'contribute',
    component: ContributeComponent,
    data: seo({
      title: 'Contributor guidelines | IJDR',
      description:
        'Submission guidelines for authors: manuscript format, peer review, ethics, and how to submit to IJDR.',
    }),
  },
  {
    path: 'login',
    component: LoginComponent,
    data: seo({
      title: 'Admin sign in | IJDR',
      description: 'Sign in to the IJDR journal administration portal.',
    }),
  },
  {
    path: 'admin',
    component: AdminComponent,
    canActivate: [AuthGuard],
    data: seo({
      title: 'Admin | IJDR',
      description: 'IJDR journal administration — manage issues and editorial board.',
    }),
  },
  {
    path: 'legal/privacy',
    component: PrivacyPolicyComponent,
    data: seo({
      title: 'Privacy policy | IJDR',
      description: 'Privacy policy for the Indian Journal of Development Research website.',
    }),
  },
  {
    path: 'legal/terms',
    component: TermsOfServiceComponent,
    data: seo({
      title: 'Terms of service | IJDR',
      description: 'Terms of service for using the Indian Journal of Development Research website.',
    }),
  },
  {
    path: 'legal/copyright',
    component: CopyrightComponent,
    data: seo({
      title: 'Copyright | IJDR',
      description: 'Copyright information for the Indian Journal of Development Research.',
    }),
  },
  {
    path: 'legal/open-access',
    component: OpenAccessComponent,
    data: seo({
      title: 'Open access | IJDR',
      description: 'Open access policy of the Indian Journal of Development Research.',
    }),
  },
  {
    path: 'legal/accessibility',
    component: AccessibilityComponent,
    data: seo({
      title: 'Accessibility | IJDR',
      description: 'Accessibility statement for the Indian Journal of Development Research website.',
    }),
  },
  {
    path: '**',
    component: PageNotFoundComponent,
    data: seo({
      title: 'Page not found | IJDR',
      description: 'The requested page could not be found.',
    }),
  },
];
