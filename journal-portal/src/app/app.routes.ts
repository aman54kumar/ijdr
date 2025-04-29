import { Routes } from '@angular/router';
import { JournalsComponent } from './components/journals/journals.component';
import { JournalDetailComponent } from './components/journal-detail/journal-detail.component';
import { HomeComponent } from './components/home/home.component';
import { PageNotFoundComponent } from './components/page-not-found/page-not-found.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'journals', component: JournalsComponent },
  { path: 'journal/:id', component: JournalDetailComponent },
  { path: '**', component: PageNotFoundComponent },
];
