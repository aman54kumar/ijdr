import { Component, ElementRef, HostListener, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FirebaseJournal } from '../../../services/firebase-journal.service';

type Filter = 'all' | 'needs' | 'drafts';

interface Group {
  year: string;
  items: FirebaseJournal[];
}

/** Searchable, year-grouped issue combobox with status badges and quick filters. */
@Component({
  selector: 'app-issue-picker',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './issue-picker.component.html',
  styleUrl: './issue-picker.component.scss',
})
export class IssuePickerComponent {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);

  issues = input.required<FirebaseJournal[]>();
  selectedId = input<string>('');
  picked = output<string>();

  readonly open = signal(false);
  readonly query = signal('');
  readonly filter = signal<Filter>('all');
  readonly active = signal(0);

  readonly selected = computed(() => this.issues().find((i) => i.id === this.selectedId()));

  readonly filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'needs', label: 'Needs articles' },
    { id: 'drafts', label: 'Has drafts' },
  ];

  readonly needsCount = computed(() => this.issues().filter((i) => this.status(i) === 'none').length);
  readonly draftsCount = computed(() => this.issues().filter((i) => this.status(i) === 'draft').length);

  /** Matches in the order given by the service (newest first), flattened for keyboard navigation. */
  readonly flat = computed(() => {
    const terms = this.query().toLowerCase().split(/\s+/).filter(Boolean);
    const f = this.filter();
    return this.issues().filter((i) => {
      const s = this.status(i);
      if (f === 'needs' && s !== 'none') return false;
      if (f === 'drafts' && s !== 'draft') return false;
      const hay = `${i.title} vol ${i.volume} volume ${i.volume} no ${i.number} number ${i.number} ${i.year} ${i.edition ?? ''}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  });

  readonly groups = computed<Group[]>(() => {
    const map = new Map<string, FirebaseJournal[]>();
    for (const i of this.flat()) {
      const y = i.year || 'Other';
      (map.get(y) ?? map.set(y, []).get(y)!).push(i);
    }
    return [...map].map(([year, items]) => ({ year, items }));
  });

  constructor() {
    // Keep the highlighted row valid as the result list changes.
    effect(() => {
      const n = this.flat().length;
      if (this.active() >= n) this.active.set(Math.max(0, n - 1));
    });
  }

  status(i: FirebaseJournal): 'none' | 'draft' | 'published' {
    return !i.articleCount ? 'none' : i.articlesStatus === 'published' ? 'published' : 'draft';
  }

  statusLabel(i: FirebaseJournal): string {
    const s = this.status(i);
    return s === 'none' ? 'No articles' : s === 'draft' ? `${i.articleCount} draft` : `${i.articleCount} published`;
  }

  label(i: FirebaseJournal): string {
    return `${i.title} (Vol ${i.volume}, No ${i.number})`;
  }

  indexOf(i: FirebaseJournal): number {
    return this.flat().indexOf(i);
  }

  toggle() {
    this.open() ? this.close() : this.openList();
  }

  openList() {
    this.open.set(true);
    this.query.set('');
    const idx = this.flat().findIndex((i) => i.id === this.selectedId());
    this.active.set(Math.max(0, idx));
    setTimeout(() => {
      this.host.nativeElement.querySelector<HTMLInputElement>('.ip-search')?.focus();
      this.host.nativeElement.querySelector('.ip-option.is-active')?.scrollIntoView({ block: 'nearest' });
    });
  }

  close() {
    this.open.set(false);
  }

  choose(i: FirebaseJournal) {
    if (i.id) this.picked.emit(i.id);
    this.close();
    this.host.nativeElement.querySelector<HTMLButtonElement>('.ip-trigger')?.focus();
  }

  setQuery(v: string) {
    this.query.set(v);
    this.active.set(0);
  }

  onKey(ev: KeyboardEvent) {
    const n = this.flat().length;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!n) return;
      this.active.set((this.active() + (ev.key === 'ArrowDown' ? 1 : -1) + n) % n);
      setTimeout(() => this.host.nativeElement.querySelector('.ip-option.is-active')?.scrollIntoView({ block: 'nearest' }));
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      const i = this.flat()[this.active()];
      if (i) this.choose(i);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      this.close();
      this.host.nativeElement.querySelector<HTMLButtonElement>('.ip-trigger')?.focus();
    }
  }

  onTriggerKey(ev: KeyboardEvent) {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!this.open()) this.openList();
    }
  }

  @HostListener('document:click', ['$event'])
  onDocClick(ev: Event) {
    if (this.open() && !this.host.nativeElement.contains(ev.target as Node)) this.close();
  }
}
