import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { ArticleInput, ArticleService } from '../../../services/article.service';
import { FirebaseJournal, FirebaseJournalService } from '../../../services/firebase-journal.service';
import { ConfirmModalService } from '../../../services/confirm-modal.service';
import { ToastService } from '../../../services/toast.service';
import { iArticle, iJournal } from '../../../type/journals.type';

/** Optional page numbers: blank -> undefined. */
function toPage(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

@Component({
  selector: 'app-admin-articles',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DragDropModule],
  templateUrl: './admin-articles.component.html',
  styleUrl: './admin-articles.component.scss',
})
export class AdminArticlesComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private articleService = inject(ArticleService);
  private journalService = inject(FirebaseJournalService);
  private confirmModal = inject(ConfirmModalService);
  private toast = inject(ToastService);
  private subs = new Subscription();
  private articlesSub?: Subscription;

  issues: FirebaseJournal[] = [];
  issueId = '';
  articles: iArticle[] = [];
  loadingArticles = false;

  /** `null` = editor closed, `'new'` = creating. */
  editing: iArticle | 'new' | null = null;
  saving = false;
  keywords: string[] = [];
  keywordDraft = '';

  form = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.maxLength(500)]],
    authors: this.fb.array([this.newAuthor()]),
    abstract: [''],
    subject: [''],
    pageStart: [null as number | null, [Validators.min(1)]],
    pageEnd: [null as number | null, [Validators.min(1)]],
    doi: [''],
    language: ['en' as 'en' | 'hi'],
    status: ['draft' as 'draft' | 'published'],
  });

  get authors(): FormArray {
    return this.form.controls.authors;
  }

  get issue(): FirebaseJournal | undefined {
    return this.issues.find((i) => i.id === this.issueId);
  }

  ngOnInit() {
    this.subs.add(
      this.journalService.getJournals().subscribe((issues) => {
        this.issues = issues;
        if (!this.issueId && issues.length) {
          this.selectIssue(issues[0].id!);
        }
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.articlesSub?.unsubscribe();
  }

  private newAuthor() {
    return this.fb.nonNullable.group({
      name: [''],
      affiliation: [''],
      email: ['', Validators.email],
      orcid: ['', Validators.pattern(/^$|^\d{4}-\d{4}-\d{4}-\d{3}[\dXx]$/)],
    });
  }

  selectIssue(id: string) {
    this.issueId = id;
    this.closeEditor();
    this.articlesSub?.unsubscribe();
    this.loadingArticles = true;
    this.articlesSub = this.articleService.getArticlesByIssue(id).subscribe({
      next: (a) => {
        this.articles = a;
        this.loadingArticles = false;
      },
      error: (e) => {
        console.error('Loading articles failed', e);
        this.loadingArticles = false;
        this.toast.show('Could not load articles for this issue.', 'danger');
      },
    });
  }

  openEditor(article?: iArticle) {
    this.editing = article ?? 'new';
    this.authors.clear();
    const authors = article?.authors?.length ? article.authors : [{ name: '' }];
    for (const a of authors) {
      const g = this.newAuthor();
      g.patchValue({
        name: a.name ?? '',
        affiliation: a.affiliation ?? '',
        email: a.email ?? '',
        orcid: a.orcid ?? '',
      });
      this.authors.push(g);
    }
    this.form.patchValue({
      title: article?.title ?? '',
      abstract: article?.abstract ?? '',
      subject: article?.subject ?? '',
      pageStart: article?.pageStart ?? null,
      pageEnd: article?.pageEnd ?? null,
      doi: article?.doi ?? '',
      language: article?.language ?? 'en',
      status: article?.status ?? 'draft',
    });
    this.keywords = [...(article?.keywords ?? [])];
    this.keywordDraft = '';
    this.form.markAsPristine();
  }

  closeEditor() {
    this.editing = null;
  }

  addAuthor() {
    this.authors.push(this.newAuthor());
  }

  removeAuthor(i: number) {
    this.authors.removeAt(i);
    if (!this.authors.length) {
      this.addAuthor();
    }
  }

  addKeywords(raw = this.keywordDraft) {
    // Allow pasting "a, b, c"
    const parts = raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    for (const p of parts) {
      if (!this.keywords.some((k) => k.toLowerCase() === p.toLowerCase())) {
        this.keywords.push(p);
      }
    }
    this.keywordDraft = '';
  }

  onKeywordKey(ev: KeyboardEvent) {
    if (ev.key === 'Enter' || ev.key === ',') {
      ev.preventDefault();
      this.addKeywords();
    } else if (ev.key === 'Backspace' && !this.keywordDraft && this.keywords.length) {
      this.keywords.pop();
    }
  }

  removeKeyword(i: number) {
    this.keywords.splice(i, 1);
  }

  private readInput(): ArticleInput | null {
    this.addKeywords(); // commit a half-typed keyword
    const v = this.form.getRawValue();
    const pageStart = toPage(v.pageStart);
    const pageEnd = toPage(v.pageEnd);
    if (pageStart && pageEnd && pageEnd < pageStart) {
      this.toast.show('End page cannot be before the start page.', 'warning');
      return null;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.show('Fix the highlighted fields first.', 'warning');
      return null;
    }
    const authors = v.authors.filter((a) => a.name.trim());
    if (v.status === 'published' && !authors.length) {
      this.toast.show('A published article needs at least one author.', 'warning');
      return null;
    }
    return {
      title: v.title,
      authors,
      abstract: v.abstract,
      keywords: this.keywords,
      subject: v.subject,
      pageStart,
      pageEnd,
      doi: v.doi,
      language: v.language,
      status: v.status,
    };
  }

  async save() {
    const issue = this.issue;
    const input = this.readInput();
    if (!issue || !input || !this.editing) {
      return;
    }
    this.saving = true;
    try {
      if (this.editing === 'new') {
        await this.articleService.createArticle(issue as iJournal, input);
        this.toast.show('Article added.', 'success');
      } else {
        await this.articleService.updateArticle(this.editing, input);
        this.toast.show('Article saved.', 'success');
      }
      this.closeEditor();
    } catch (e) {
      console.error('Saving article failed', e);
      this.toast.show('Could not save the article.', 'danger');
    } finally {
      this.saving = false;
    }
  }

  async toggleStatus(a: iArticle) {
    const next = a.status === 'published' ? 'draft' : 'published';
    try {
      await this.articleService.setStatus(a, next);
      this.toast.show(next === 'published' ? 'Published.' : 'Moved back to draft.', 'success');
    } catch (e) {
      console.error('Status change failed', e);
      this.toast.show('Could not change the status.', 'danger');
    }
  }

  async remove(a: iArticle) {
    const ok = await this.confirmModal.ask('Delete article', `Delete "${a.title}"? This cannot be undone.`);
    if (!ok) {
      return;
    }
    try {
      await this.articleService.deleteArticle(a);
      if (this.editing && this.editing !== 'new' && this.editing.id === a.id) {
        this.closeEditor();
      }
      this.toast.show('Article deleted.', 'success');
    } catch (e) {
      console.error('Delete failed', e);
      this.toast.show('Could not delete the article.', 'danger');
    }
  }

  async drop(ev: CdkDragDrop<iArticle[]>) {
    if (ev.previousIndex === ev.currentIndex) {
      return;
    }
    const prev = [...this.articles];
    moveItemInArray(this.articles, ev.previousIndex, ev.currentIndex);
    this.articles = [...this.articles];
    try {
      await this.articleService.reorder(this.articles);
    } catch (e) {
      console.error('Reorder failed', e);
      this.articles = prev;
      this.toast.show('Could not save the new order.', 'danger');
    }
  }

  /** Keyboard alternative to dragging. */
  async move(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= this.articles.length) {
      return;
    }
    await this.drop({ previousIndex: i, currentIndex: j } as CdkDragDrop<iArticle[]>);
  }

  authorLine(a: iArticle): string {
    if (!a.authors.length) return 'No authors';
    const names = a.authors.slice(0, 3).map((x) => x.name);
    return names.join(', ') + (a.authors.length > 3 ? ' et al.' : '');
  }

  pages(a: iArticle): string {
    if (!a.pageStart) return '';
    return a.pageEnd && a.pageEnd !== a.pageStart ? `pp. ${a.pageStart}–${a.pageEnd}` : `p. ${a.pageStart}`;
  }
}
