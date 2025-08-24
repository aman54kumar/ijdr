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

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'journals', component: JournalsComponent },
  { path: 'journal/:id', component: PdfViewerComponent },
  { path: 'about', component: AboutComponent },
  { path: 'editorial-board', component: EditorialBoardComponent },
  { path: 'advisory-board', component: AdvisoryBoardComponent },
  { path: 'publisher', component: PublisherComponent },
  { path: 'contact', component: ContactComponent },
  { path: 'contribute', component: ContributeComponent },
  { path: 'login', component: LoginComponent },
  {
    path: 'admin',
    component: AdminComponent,
    canActivate: [AuthGuard],
  },
  // Legal Pages
  { path: 'legal/privacy', component: PrivacyPolicyComponent },
  { path: 'legal/terms', component: TermsOfServiceComponent },
  { path: 'legal/copyright', component: CopyrightComponent },
  { path: 'legal/open-access', component: OpenAccessComponent },
  { path: 'legal/accessibility', component: AccessibilityComponent },
  { path: '**', component: PageNotFoundComponent },
];
