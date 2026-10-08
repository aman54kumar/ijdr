import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges,
  OnDestroy, Output, SimpleChanges, ViewChild, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PdfJsService, PDFJS_CMAP_URL } from '../../services/pdfjs.service';
import { AnalyticsEventsService } from '../../services/analytics-events.service';
import { iArticle, iJournal } from '../../type/journals.type';
import { publicPdfDisplayUrl } from '../../utils/public-pdf-url.util';
import {
  PAGE_GAP, clampPage, countOccurrences, fitScale, nextZoom, pageAtScroll, readLastPage, saveLastPage,
  scrollTopForPage, startingPage,
} from '../../utils/pdf-reader.util';

type Doc = any; // pdfjs PDFDocumentProxy (typed loosely: the library is loaded lazily)

/**
 * Shared PDF reader: continuous scroll, lazy page rendering, text layer (selectable text and
 * search highlights), thumbnails, article outline, zoom / fit, keyboard shortcuts, and
 * "remember my page". Used by the /journal/:id page and by the modal.
 */
@Component({
  selector: 'app-pdf-reader',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './pdf-reader.component.html',
  styleUrl: './pdf-reader.component.scss',
})
export class PdfReaderComponent implements AfterViewInit, OnChanges, OnDestroy {
  private pdfjs = inject(PdfJsService);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private analytics = inject(AnalyticsEventsService);

  @Input({ required: true }) journal!: Pick<iJournal, 'id' | 'title' | 'pdfUrl'>;
  /** Explicit page to open at (deep link). Later changes scroll to that page. */
  @Input() page: number | null = null;
  @Input() articles: iArticle[] = [];
  @Input() embedded = false;
  @Output() pageChange = new EventEmitter<number>();

  @ViewChild('scroller') scrollerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('root') rootRef!: ElementRef<HTMLDivElement>;
  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  loading = true;
  error = '';
  numPages = 0;
  pageList: number[] = [];
  currentPage = 1;
  pageInput = '1';
  scale = 1;
  fitMode: 'width' | 'page' | 'custom' = 'width';
  sidebarOpen = false;
  sidebarTab: 'pages' | 'articles' = 'pages';
  resumedNote = '';

  // search
  searchOpen = false;
  query = '';
  searching = false;
  searchProgress = 0;
  hits: { page: number }[] = [];
  hitIndex = -1;

  pageW = 600;
  pageH = 800;
  private base = { width: 600, height: 800 };
  private doc?: Doc;
  private pageText: (string | undefined)[] = [];
  private searchToken = 0;
  private destroyed = false;
  private viewObserver?: IntersectionObserver;
  private thumbObserver?: IntersectionObserver;
  private resizeObserver?: ResizeObserver;
  private visible = new Set<number>();
  private rendered = new Map<number, number>(); // page -> scale it was rendered at
  private renderTasks = new Map<number, { cancel: () => void }>();
  private rendering = false;
  private thumbsDone = new Set<number>();
  private thumbQueue: number[] = [];
  private thumbBusy = false;
  private persistTimer?: ReturnType<typeof setTimeout>;
  private scrollRaf = 0;
  private loadedId = '';

  ngAfterViewInit() {
    this.resizeObserver = new ResizeObserver(() => {
      if (this.numPages && this.fitMode !== 'custom') this.applyFit(this.fitMode);
    });
    this.resizeObserver.observe(this.scrollerRef.nativeElement);
    void this.open();
  }

  ngOnChanges(ch: SimpleChanges) {
    if (ch['journal'] && !ch['journal'].firstChange && this.journal?.id !== this.loadedId) {
      void this.open();
    } else if (ch['page'] && !ch['page'].firstChange && this.page && this.numPages && this.page !== this.currentPage) {
      this.goToPage(this.page);
    }
  }

  ngOnDestroy() {
    this.destroyed = true;
    this.viewObserver?.disconnect();
    this.thumbObserver?.disconnect();
    this.resizeObserver?.disconnect();
    clearTimeout(this.persistTimer);
    cancelAnimationFrame(this.scrollRaf);
    this.renderTasks.forEach((t) => t.cancel());
    void this.doc?.destroy();
  }

  // ---- loading -----------------------------------------------------------

  get downloadUrl(): string {
    return publicPdfDisplayUrl(this.journal.id, this.journal.pdfUrl);
  }

  async open() {
    this.loading = true;
    this.error = '';
    this.loadedId = this.journal.id;
    this.visible.clear();
    this.rendered.clear();
    this.thumbsDone.clear();
    this.pageText = [];
    this.hits = [];
    this.hitIndex = -1;
    void this.doc?.destroy();
    this.doc = undefined;
    this.numPages = 0;
    this.pageList = [];

    const lib = await this.pdfjs.load();
    // Direct Storage URL first (range requests, so page 1 shows quickly); the /pdf proxy as a fallback.
    const urls = [...new Set([this.journal.pdfUrl, this.downloadUrl])];
    let doc: Doc | undefined;
    for (const url of urls) {
      try {
        doc = await lib.getDocument({
          url,
          disableAutoFetch: true,
          rangeChunkSize: 262144,
          cMapUrl: PDFJS_CMAP_URL,
          cMapPacked: true,
        }).promise;
        break;
      } catch (e) {
        console.warn('PDF load failed for', url, e);
      }
    }
    if (this.destroyed || this.loadedId !== this.journal.id) {
      void doc?.destroy();
      return;
    }
    if (!doc) {
      this.error = 'The PDF could not be loaded.';
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }
    this.doc = doc;
    this.numPages = doc.numPages;
    this.pageList = Array.from({ length: doc.numPages }, (_, i) => i + 1);
    const first = await doc.getPage(1);
    const vp = first.getViewport({ scale: 1 });
    this.base = { width: vp.width, height: vp.height };
    this.loading = false;
    this.analytics.log('pdf_view', { journal_id: this.journal.id, pages: doc.numPages });
    this.cdr.detectChanges();

    this.setupObservers();
    this.applyFit('width');
    const remembered = readLastPage(this.journal.id);
    const start = startingPage(this.page, remembered, doc.numPages);
    if (start > 1) {
      if (!this.page) this.resumedNote = `Resumed at page ${start}.`;
      this.goToPage(start);
    }
  }

  retry() {
    void this.open();
  }

  private setupObservers() {
    this.viewObserver?.disconnect();
    const root = this.scrollerRef.nativeElement;
    this.viewObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset['page']);
          if (e.isIntersecting) this.visible.add(n);
          else {
            this.visible.delete(n);
            this.release(n);
          }
        }
        void this.pump();
      },
      { root, rootMargin: '700px 0px' }
    );
    root.querySelectorAll('.pg').forEach((el) => this.viewObserver!.observe(el));
  }

  // ---- layout, zoom, fit ----------------------------------------------------

  private applyScale(s: number) {
    this.scale = Math.round(s * 100) / 100;
    this.pageW = this.base.width * this.scale;
    this.pageH = this.base.height * this.scale;
    this.rendered.clear();
    this.renderTasks.forEach((t) => t.cancel());
    this.renderTasks.clear();
    this.cdr.detectChanges();
    // keep the same page in view after the layout changes
    this.scrollerRef.nativeElement.scrollTop = scrollTopForPage(this.currentPage, this.pageH);
    void this.pump();
  }

  applyFit(mode: 'width' | 'page') {
    this.fitMode = mode;
    const el = this.scrollerRef.nativeElement;
    this.applyScale(fitScale(mode, { width: el.clientWidth, height: el.clientHeight }, this.base));
  }

  zoom(dir: 1 | -1) {
    this.fitMode = 'custom';
    this.applyScale(nextZoom(this.scale, dir));
  }

  // ---- rendering -----------------------------------------------------------

  private release(n: number) {
    this.renderTasks.get(n)?.cancel();
    this.renderTasks.delete(n);
    if (!this.rendered.has(n) && !this.renderTasks.has(n)) return;
    const pg = this.pageEl(n);
    const canvas = pg?.querySelector('canvas');
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
    const tl = pg?.querySelector('.textLayer');
    if (tl) tl.innerHTML = '';
    this.rendered.delete(n);
  }

  private pageEl(n: number): HTMLElement | null {
    return this.scrollerRef.nativeElement.querySelector(`.pg[data-page="${n}"]`);
  }

  /** Render visible pages one at a time, nearest to the current page first. */
  private async pump() {
    if (this.rendering || !this.doc) return;
    this.rendering = true;
    try {
      for (;;) {
        const todo = [...this.visible]
          .filter((n) => this.rendered.get(n) !== this.scale)
          .sort((a, b) => Math.abs(a - this.currentPage) - Math.abs(b - this.currentPage));
        if (!todo.length || this.destroyed) break;
        await this.renderPage(todo[0]);
      }
    } finally {
      this.rendering = false;
    }
  }

  private async renderPage(n: number) {
    const scaleAtStart = this.scale;
    const pg = this.pageEl(n);
    const canvas = pg?.querySelector('canvas') as HTMLCanvasElement | null;
    const textDiv = pg?.querySelector('.textLayer') as HTMLElement | null;
    if (!pg || !canvas || !this.doc) return;
    try {
      const page = await this.doc.getPage(n);
      const viewport = page.getViewport({ scale: scaleAtStart });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const ctx = canvas.getContext('2d')!;
      const task = page.render({
        canvasContext: ctx,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      this.renderTasks.set(n, task);
      await task.promise;
      this.renderTasks.delete(n);
      if (scaleAtStart !== this.scale) return;
      if (textDiv) {
        textDiv.innerHTML = '';
        const lib = await this.pdfjs.load();
        await lib.renderTextLayer({
          textContentSource: page.streamTextContent(),
          container: textDiv,
          viewport,
        }).promise;
        this.markHighlights(n);
      }
      this.rendered.set(n, scaleAtStart);
    } catch (e: any) {
      if (e?.name === 'RenderingCancelledException') return;
      console.warn('Render failed for page', n, e);
      this.rendered.set(n, scaleAtStart); // do not retry forever
    }
  }

  // ---- navigation ----------------------------------------------------------

  onScroll() {
    cancelAnimationFrame(this.scrollRaf);
    this.scrollRaf = requestAnimationFrame(() => {
      const el = this.scrollerRef.nativeElement;
      const p = pageAtScroll(el.scrollTop, el.clientHeight, this.pageH, this.numPages);
      if (p !== this.currentPage) this.setCurrent(p);
    });
  }

  private setCurrent(p: number) {
    this.currentPage = p;
    this.pageInput = String(p);
    this.resumedNote = '';
    this.cdr.markForCheck();
    this.zone.run(() => this.cdr.detectChanges());
    this.pageChange.emit(p);
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => saveLastPage(this.journal.id, p), 500);
    void this.pump();
  }

  goToPage(n: number) {
    if (!this.numPages) return;
    const p = clampPage(n, this.numPages);
    this.scrollerRef.nativeElement.scrollTop = scrollTopForPage(p, this.pageH);
    this.setCurrent(p);
  }

  submitPageInput() {
    this.goToPage(parseInt(this.pageInput, 10));
  }

  // ---- sidebar thumbnails ------------------------------------------------------

  toggleSidebar() {
    this.sidebarOpen = !this.sidebarOpen;
    this.cdr.detectChanges();
    if (this.sidebarOpen) this.setupThumbs();
    if (this.fitMode !== 'custom') setTimeout(() => this.applyFit(this.fitMode as 'width' | 'page'));
  }

  setSidebarTab(t: 'pages' | 'articles') {
    this.sidebarTab = t;
    this.cdr.detectChanges();
    if (t === 'pages') this.setupThumbs();
  }

  private setupThumbs() {
    this.thumbObserver?.disconnect();
    const list = this.rootRef.nativeElement.querySelector('.thumbs') as HTMLElement | null;
    if (!list) return;
    this.thumbObserver = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number((e.target as HTMLElement).dataset['thumb']);
          if (e.isIntersecting && !this.thumbsDone.has(n) && !this.thumbQueue.includes(n)) this.thumbQueue.push(n);
        }
        void this.drainThumbs();
      },
      { root: list, rootMargin: '300px 0px' }
    );
    list.querySelectorAll('[data-thumb]').forEach((el) => this.thumbObserver!.observe(el));
  }

  private async drainThumbs() {
    if (this.thumbBusy || !this.doc) return;
    this.thumbBusy = true;
    try {
      while (this.thumbQueue.length && !this.destroyed) {
        const n = this.thumbQueue.shift()!;
        const canvas = this.rootRef.nativeElement.querySelector(`[data-thumb="${n}"] canvas`) as HTMLCanvasElement | null;
        if (!canvas) continue;
        const page = await this.doc.getPage(n);
        const vp0 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: 110 / vp0.width });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        this.thumbsDone.add(n);
      }
    } catch (e) {
      console.warn('Thumbnail failed', e);
    } finally {
      this.thumbBusy = false;
    }
  }

  get activeArticleId(): string | undefined {
    const p = this.currentPage;
    return [...this.articles]
      .filter((a) => a.pageStart && a.pageStart <= p)
      .sort((a, b) => b.pageStart! - a.pageStart!)[0]?.id;
  }

  // ---- search ---------------------------------------------------------------

  openSearch() {
    this.searchOpen = true;
    this.cdr.detectChanges();
    this.searchInput?.nativeElement.focus();
    this.searchInput?.nativeElement.select();
  }

  closeSearch() {
    this.searchOpen = false;
    this.searchToken++;
    this.searching = false;
    this.query = '';
    this.hits = [];
    this.hitIndex = -1;
    this.clearHighlights();
    this.rootRef.nativeElement.focus();
  }

  private async textOf(n: number): Promise<string> {
    if (this.pageText[n] !== undefined) return this.pageText[n]!;
    const page = await this.doc!.getPage(n);
    const tc = await page.getTextContent();
    const text = tc.items.map((i: any) => i.str).join(' ').toLowerCase();
    this.pageText[n] = text;
    return text;
  }

  async runSearch() {
    const q = this.query.trim().toLowerCase();
    const token = ++this.searchToken;
    this.hits = [];
    this.hitIndex = -1;
    this.clearHighlights();
    if (q.length < 2 || !this.doc) {
      this.searching = false;
      return;
    }
    this.searching = true;
    for (let n = 1; n <= this.numPages; n++) {
      if (token !== this.searchToken || this.destroyed) return;
      const c = countOccurrences(await this.textOf(n), q);
      for (let i = 0; i < c; i++) this.hits.push({ page: n });
      this.searchProgress = n;
      if (this.hitIndex === -1 && this.hits.length) {
        this.hitIndex = 0;
        this.goToPage(this.hits[0].page);
      }
      this.cdr.detectChanges();
    }
    if (token === this.searchToken) {
      this.searching = false;
      this.rendered.clear(); // re-render text layers so highlights appear
      void this.pump();
      this.cdr.detectChanges();
    }
  }

  step(dir: 1 | -1) {
    if (!this.hits.length) return;
    this.hitIndex = (this.hitIndex + dir + this.hits.length) % this.hits.length;
    this.goToPage(this.hits[this.hitIndex].page);
  }

  private markHighlights(n: number) {
    const q = this.query.trim().toLowerCase();
    if (!q || q.length < 2) return;
    this.pageEl(n)
      ?.querySelectorAll('.textLayer span')
      .forEach((s) => {
        if ((s.textContent ?? '').toLowerCase().includes(q)) s.classList.add('hl');
      });
  }

  private clearHighlights() {
    this.scrollerRef?.nativeElement.querySelectorAll('.textLayer .hl').forEach((s) => s.classList.remove('hl'));
  }

  // ---- keyboard ---------------------------------------------------------------

  onKey(ev: KeyboardEvent) {
    const typing = (ev.target as HTMLElement | null)?.tagName === 'INPUT';
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'f') {
      ev.preventDefault();
      this.openSearch();
      return;
    }
    if (typing) {
      if (ev.key === 'Escape' && this.searchOpen) {
        ev.stopPropagation();
        this.closeSearch();
      }
      return;
    }
    switch (ev.key) {
      case '/':
        ev.preventDefault();
        this.openSearch();
        break;
      case 'ArrowRight':
        this.goToPage(this.currentPage + 1);
        break;
      case 'ArrowLeft':
        this.goToPage(this.currentPage - 1);
        break;
      case 'Home':
        ev.preventDefault();
        this.goToPage(1);
        break;
      case 'End':
        ev.preventDefault();
        this.goToPage(this.numPages);
        break;
      case '+':
      case '=':
        this.zoom(1);
        break;
      case '-':
        this.zoom(-1);
        break;
      case '0':
        this.applyFit('width');
        break;
      case 'Escape':
        if (this.searchOpen) {
          ev.stopPropagation();
          this.closeSearch();
        }
        break;
    }
  }
}
