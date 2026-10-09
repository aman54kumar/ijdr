import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { IssuePickerComponent } from '../issue-picker/issue-picker.component';
import { ArticleInput, ArticleService } from '../../../services/article.service';
import { FirebaseJournal, FirebaseJournalService } from '../../../services/firebase-journal.service';
import { ConfirmModalService } from '../../../services/confirm-modal.service';
import { ToastService } from '../../../services/toast.service';
import { CoverService } from '../../../services/cover.service';
import { AiService, aiErrorMessage } from '../../../services/ai.service';
import { GEMINI_MODEL_CHOICES, IngestService, ingestErrorMessage } from '../../../services/ingest.service';
import { iArticle, iJournal, IngestJob } from '../../../type/journals.type';

const LAST_ISSUE_KEY = 'ijdr.admin.articles.issue';

/** Optional page numbers: blank -> undefined. */
function toPage(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

@Component({
  selector: 'app-admin-articles',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, DragDropModule, IssuePickerComponent],
  templateUrl: './admin-articles.component.html',
  styleUrl: './admin-articles.component.scss',
})
export class AdminArticlesComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private articleService = inject(ArticleService);
  private journalService = inject(FirebaseJournalService);
  private confirmModal = inject(ConfirmModalService);
  private toast = inject(ToastService);
  private ingest = inject(IngestService);
  private ai = inject(AiService);
  private covers = inject(CoverService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private subs = new Subscription();
  private articlesSub?: Subscription;
  private jobSub?: Subscription;

  // AI model selection (stored in adminSettings/ai, read by the functions)
  readonly modelChoices = GEMINI_MODEL_CHOICES;
  model = '';
  publicModel = '';
  saved = { model: '', publicModel: '' };
  savingModel = false;

  // AI extraction + review
  job?: IngestJob;
  extracting = false;
  /** Ids of AI drafts the admin has accepted (checked) for publishing. */
  accepted = new Set<string>();
  /** Page previews: article id -> data URL, '' while loading, 'error' on failure. */
  previews = new Map<string, string>();
  bulkBusy = false;

  // AI content of the article being edited
  aiSummary?: { hidden?: boolean; text: string };
  aiHasTranslation = false;
  aiBusy = false;

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
    this.ingest
      .getModels()
      .then((m) => {
        this.saved = m;
        this.model = m.model;
        this.publicModel = m.publicModel;
      })
      .catch(() => undefined);
    this.subs.add(
      this.journalService.getJournals().subscribe((issues) => {
        this.issues = issues;
        if (!this.issueId && issues.length) {
          this.selectIssue(this.initialIssueId(issues), false);
        }
      })
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.articlesSub?.unsubscribe();
    this.jobSub?.unsubscribe();
  }

  private newAuthor() {
    return this.fb.nonNullable.group({
      name: [''],
      affiliation: [''],
      email: ['', Validators.email],
      orcid: ['', Validators.pattern(/^$|^\d{4}-\d{4}-\d{4}-\d{3}[\dXx]$/)],
    });
  }

  /** Deep link (?issue=) wins, then the last issue worked on, then the newest. */
  private initialIssueId(issues: FirebaseJournal[]): string {
    const has = (id: string | null | undefined): id is string => !!id && issues.some((i) => i.id === id);
    const fromUrl = this.route.snapshot.queryParamMap.get('issue');
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(LAST_ISSUE_KEY);
    } catch {
      /* storage unavailable */
    }
    return has(fromUrl) ? fromUrl : has(saved) ? saved : issues[0].id!;
  }

  private rememberIssue(id: string) {
    try {
      localStorage.setItem(LAST_ISSUE_KEY, id);
    } catch {
      /* storage unavailable */
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { issue: id },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  selectIssue(id: string, remember = true) {
    if (remember) this.rememberIssue(id);
    this.issueId = id;
    this.closeEditor();
    this.articlesSub?.unsubscribe();
    this.jobSub?.unsubscribe();
    this.job = undefined;
    this.accepted.clear();
    this.previews.clear();
    this.jobSub = this.ingest.watchJob(id).subscribe({
      next: (j) => (this.job = j),
      error: () => (this.job = undefined),
    });
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
    this.aiSummary = undefined;
    this.aiHasTranslation = false;
    if (article) {
      void this.loadAiState(article.id);
    }
    this.keywords = [...(article?.keywords ?? [])];
    this.keywordDraft = '';
    this.form.markAsPristine();
  }

  private async loadAiState(id: string) {
    const [s, t] = await Promise.all([this.ai.cachedSummary(id), this.ai.cachedTranslation(id)]);
    if (this.editing !== 'new' && this.editing?.id === id) {
      this.aiSummary = s;
      this.aiHasTranslation = !!t;
    }
  }

  async generateAi(kind: 'summary' | 'translation') {
    if (this.editing === 'new' || !this.editing) return;
    const id = this.editing.id;
    this.aiBusy = true;
    try {
      await this.ai.adminGenerate(id, kind);
      this.toast.show(kind === 'summary' ? 'Summary generated.' : 'Hindi translation generated.', 'success');
      await this.loadAiState(id);
    } catch (e) {
      this.toast.show(aiErrorMessage(e), 'danger');
    } finally {
      this.aiBusy = false;
    }
  }

  async toggleSummaryHidden() {
    if (this.editing === 'new' || !this.editing || !this.aiSummary) return;
    const hide = !this.aiSummary.hidden;
    try {
      await this.ai.setSummaryHidden(this.editing.id, hide);
      this.aiSummary = { ...this.aiSummary, hidden: hide };
      this.toast.show(hide ? 'Summary hidden from readers.' : 'Summary visible again.', 'success');
    } catch {
      this.toast.show('Could not change the summary visibility.', 'danger');
    }
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

  /** Untouched or edited AI drafts waiting for review. */
  get aiDrafts(): iArticle[] {
    return this.articles.filter((a) => a.source === 'ai' && a.status === 'draft');
  }

  get acceptedDrafts(): iArticle[] {
    return this.aiDrafts.filter((a) => this.accepted.has(a.id));
  }

  get jobRunning(): boolean {
    return this.extracting || this.job?.state === 'running';
  }

  /** Known models, plus a saved id that is not in the list so it still shows. */
  optionsFor(current: string): string[] {
    return current && !this.modelChoices.includes(current) ? [current, ...this.modelChoices] : this.modelChoices;
  }

  get modelsChanged(): boolean {
    return this.model.trim() !== this.saved.model || this.publicModel.trim() !== this.saved.publicModel;
  }

  async saveModels() {
    const next = { model: this.model.trim(), publicModel: this.publicModel.trim() };
    if ([next.model, next.publicModel].some((m) => m && !/^[A-Za-z0-9._-]{1,80}$/.test(m))) {
      this.toast.show('That does not look like a valid model id.', 'warning');
      return;
    }
    this.savingModel = true;
    try {
      await this.ingest.setModels(next);
      this.saved = next;
      this.model = next.model;
      this.publicModel = next.publicModel;
      this.toast.show('AI models saved.', 'success');
    } catch {
      this.toast.show('Could not save the AI models.', 'danger');
    } finally {
      this.savingModel = false;
    }
  }

  async extractWithAi() {
    const issue = this.issue;
    if (!issue || this.jobRunning) {
      return;
    }
    const hasDrafts = this.aiDrafts.some((a) => !a.humanEdited);
    const ok = await this.confirmModal.ask(
      'Extract articles with AI',
      `Send "${issue.title}" to Google Gemini to draft its article list? Only send issues that are already public; free-tier inputs may be used by Google to improve its models. ` +
        (hasDrafts ? 'Existing untouched AI drafts will be replaced; published and edited articles are kept.' : 'Results arrive as drafts for you to review.')
    );
    if (!ok) {
      return;
    }
    this.extracting = true;
    try {
      const r = await this.ingest.extract(issue.id!);
      this.toast.show(`Extracted ${r.created} draft article${r.created === 1 ? '' : 's'}. Review them below.`, 'success');
      this.accepted = new Set();
      this.previews.clear();
    } catch (e) {
      console.error('Extraction failed', e);
      this.toast.show(ingestErrorMessage(e), 'danger');
    } finally {
      this.extracting = false;
    }
  }

  toggleAccepted(a: iArticle) {
    if (!this.accepted.delete(a.id)) {
      this.accepted.add(a.id);
    }
  }

  toggleAllAccepted() {
    const drafts = this.aiDrafts;
    if (this.accepted.size === drafts.length) {
      this.accepted.clear();
    } else {
      this.accepted = new Set(drafts.map((a) => a.id));
    }
  }

  async publishAccepted() {
    const list = this.acceptedDrafts;
    const noAuthors = list.filter((a) => !a.authors.length);
    if (noAuthors.length) {
      this.toast.show(`${noAuthors.length} accepted article(s) have no author. Edit them first.`, 'warning');
      return;
    }
    await this.bulk(list, 'publish');
  }

  async rejectAccepted() {
    const list = this.acceptedDrafts;
    const ok = await this.confirmModal.ask('Reject drafts', `Delete ${list.length} selected draft${list.length === 1 ? '' : 's'}?`);
    if (ok) {
      await this.bulk(list, 'delete');
    }
  }

  private async bulk(list: iArticle[], action: 'publish' | 'delete') {
    if (!list.length) {
      return;
    }
    this.bulkBusy = true;
    try {
      if (action === 'publish') {
        await this.articleService.setStatusMany(list, 'published');
      } else {
        await this.articleService.deleteMany(list);
      }
      list.forEach((a) => this.accepted.delete(a.id));
      this.toast.show(action === 'publish' ? `Published ${list.length}.` : `Deleted ${list.length}.`, 'success');
    } catch (e) {
      console.error('Bulk action failed', e);
      this.toast.show('Could not complete that action.', 'danger');
    } finally {
      this.bulkBusy = false;
    }
  }

  /** Toggle the page preview beside a draft (renders the article's first page from the issue PDF). */
  async togglePreview(a: iArticle) {
    if (this.previews.has(a.id)) {
      this.previews.delete(a.id);
      return;
    }
    const url = this.issue?.pdfUrl;
    if (!url || !a.pageStart) {
      return;
    }
    this.previews.set(a.id, '');
    try {
      this.previews.set(a.id, await this.covers.renderPagePreview(url, a.pageStart));
    } catch (e) {
      console.warn('Preview failed', e);
      this.previews.set(a.id, 'error');
    }
  }

  confidenceLabel(a: iArticle): string {
    return a.aiConfidence == null ? '' : `${Math.round(a.aiConfidence * 100)}%`;
  }

  pages(a: iArticle): string {
    if (!a.pageStart) return '';
    return a.pageEnd && a.pageEnd !== a.pageStart ? `pp. ${a.pageStart}–${a.pageEnd}` : `p. ${a.pageStart}`;
  }
}
