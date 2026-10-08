import { Injectable, Injector, inject } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Observable, combineLatest, firstValueFrom, of, shareReplay } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { ArticleService } from './article.service';
import { FirebaseJournalService } from './firebase-journal.service';
import { SearchResult, mergeResults, rankArticles, rankIssues, rankMembers } from '../utils/search-rank.util';
import { tokenize } from '../utils/article-search.util';
import { BoardMember, iArticle, iJournal } from '../type/journals.type';
import { SearchOverlayComponent } from '../components/search/search-overlay.component';

const RECENT_KEY = 'ijdr-recent-searches';
const RECENT_MAX = 5;

@Injectable({ providedIn: 'root' })
export class SearchService {
  private overlay = inject(Overlay);
  private injector = inject(Injector);
  private articles = inject(ArticleService);
  private journals = inject(FirebaseJournalService);
  private ref?: OverlayRef;

  // Issues and board members are small collections: fetched once per session, matched locally.
  private issues$: Observable<iJournal[]> = (this.journals.getJournals() as Observable<iJournal[]>).pipe(
    catchError(() => of([] as iJournal[])),
    shareReplay({ bufferSize: 1, refCount: false })
  );
  private members$: Observable<BoardMember[]> = this.journals.getBoardMembers().pipe(
    catchError(() => of([] as BoardMember[])),
    shareReplay({ bufferSize: 1, refCount: false })
  );

  get isOpen(): boolean {
    return !!this.ref?.hasAttached();
  }

  open(): void {
    if (this.isOpen) return;
    this.ref = this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'search-backdrop',
      panelClass: 'search-panel',
      positionStrategy: this.overlay.position().global().centerHorizontally().top('10vh'),
      scrollStrategy: this.overlay.scrollStrategies.block(),
    });
    const portal = new ComponentPortal(SearchOverlayComponent, null, this.injector);
    this.ref.attach(portal);
    this.ref.backdropClick().subscribe(() => this.close());
  }

  close(): void {
    this.ref?.dispose();
    this.ref = undefined;
  }

  /** Query articles by token (Firestore), issues and members locally. */
  async search(q: string): Promise<SearchResult[]> {
    const tokens = tokenize(q);
    if (!tokens.length) return [];
    // Whole tokens only hit Firestore's array-contains-any; prefixes are still matched locally on what comes back.
    const articles$: Observable<iArticle[]> = this.articles.searchByToken(tokens).pipe(catchError(() => of([] as iArticle[])));
    const [arts, issues, members] = await firstValueFrom(
      combineLatest([articles$, this.issues$, this.members$]).pipe(map((x) => x))
    );
    return mergeResults([rankArticles(q, arts), rankIssues(q, issues), rankMembers(q, members)]);
  }

  recent(): string[] {
    try {
      const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, RECENT_MAX) : [];
    } catch {
      return [];
    }
  }

  remember(q: string): void {
    const t = q.trim();
    if (!t) return;
    try {
      const next = [t, ...this.recent().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, RECENT_MAX);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  }

  clearRecent(): void {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      /* ignore */
    }
  }
}
