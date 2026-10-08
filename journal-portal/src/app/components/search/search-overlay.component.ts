import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { A11yModule } from '@angular/cdk/a11y';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { SearchService } from '../../services/search.service';
import { AiService } from '../../services/ai.service';
import { AnalyticsEventsService } from '../../services/analytics-events.service';
import { SearchResult } from '../../utils/search-rank.util';

const KIND_LABEL: Record<SearchResult['kind'], string> = { article: 'Article', issue: 'Issue', member: 'Board' };

@Component({
  selector: 'app-search-overlay',
  standalone: true,
  imports: [CommonModule, FormsModule, A11yModule],
  templateUrl: './search-overlay.component.html',
  styleUrl: './search-overlay.component.scss',
})
export class SearchOverlayComponent implements AfterViewInit, OnDestroy {
  private search = inject(SearchService);
  private router = inject(Router);
  private ai = inject(AiService);
  private analytics = inject(AnalyticsEventsService);
  private settingsSub = this.ai.settings$().subscribe((s) => (this.semanticAvailable = s.semanticSearch && this.ai.appCheckReady));
  private input$ = new Subject<string>();
  private sub: Subscription;
  private seq = 0;

  @ViewChild('box') box!: ElementRef<HTMLInputElement>;

  q = '';
  results: SearchResult[] = [];
  recent: string[] = this.search.recent();
  active = -1;
  searching = false;
  semanticAvailable = false;
  semantic = false;
  semanticError = '';
  failed = false;
  readonly kindLabel = KIND_LABEL;

  constructor() {
    this.sub = this.input$.pipe(debounceTime(250), distinctUntilChanged()).subscribe((q) => void this.run(q));
  }

  ngAfterViewInit() {
    this.box.nativeElement.focus();
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
    this.settingsSub.unsubscribe();
  }

  toggleSemantic() {
    this.semantic = !this.semantic;
    if (this.q.trim()) this.input$.next(this.q.trim() + ' ');
  }

  onInput(v: string) {
    this.q = v;
    this.active = -1;
    if (!v.trim()) {
      this.results = [];
      this.searching = false;
      this.seq++;
    } else {
      this.input$.next(v.trim());
    }
  }

  private async run(q: string) {
    const mine = ++this.seq;
    this.searching = true;
    this.failed = false;
    try {
      this.semanticError = '';
      let r: SearchResult[];
      if (this.semantic && this.semanticAvailable) {
        try {
          r = (await this.ai.semanticSearch(q.trim())).map((h) => ({
            kind: 'article' as const,
            id: h.id,
            title: h.title,
            subtitle: `${h.authors.join(', ')} · ${h.issueYear}`,
            link: ['/article', h.id],
            score: h.score,
          }));
        } catch {
          // Fall back to normal search so the box never goes dead.
          this.semanticError = 'Meaning-based search is unavailable; showing keyword results.';
          r = await this.search.search(q);
        }
      } else {
        r = await this.search.search(q);
      }
      if (mine === this.seq) {
        // Only the number of results is logged, never what was typed.
        this.analytics.log('search', { results: r.length, mode: this.semantic ? 'semantic' : 'keyword' });
        this.results = r;
        this.active = r.length ? 0 : -1;
      }
    } catch {
      if (mine === this.seq) {
        this.results = [];
        this.failed = true;
      }
    } finally {
      if (mine === this.seq) this.searching = false;
    }
  }

  onKey(ev: KeyboardEvent) {
    const n = this.results.length;
    switch (ev.key) {
      case 'ArrowDown':
        ev.preventDefault();
        if (n) this.active = (this.active + 1) % n;
        break;
      case 'ArrowUp':
        ev.preventDefault();
        if (n) this.active = (this.active - 1 + n) % n;
        break;
      case 'Enter':
        ev.preventDefault();
        if (this.results[this.active]) this.go(this.results[this.active]);
        else if (this.q.trim()) this.browse();
        break;
      case 'Escape':
        ev.preventDefault();
        this.close();
        break;
    }
  }

  pickRecent(q: string) {
    this.q = q;
    this.input$.next(q);
  }

  clearRecent() {
    this.search.clearRecent();
    this.recent = [];
  }

  go(r: SearchResult) {
    this.search.remember(this.q);
    this.close();
    void this.router.navigate(r.link);
  }

  /** No result picked: show all matches on the browse page. */
  browse() {
    this.search.remember(this.q);
    this.close();
    void this.router.navigate(['/articles'], { queryParams: { q: this.q.trim() } });
  }

  close() {
    this.search.close();
  }
}
