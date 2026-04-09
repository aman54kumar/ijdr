import { Component, OnInit, Optional, DestroyRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  RouterOutlet,
  Router,
  NavigationEnd,
  ActivatedRoute,
} from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { filter } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HeaderComponent } from './components/common/header/header.component';
import { FooterComponent } from './components/common/footer/footer.component';
import { PdfModalComponent } from './components/pdf-modal/pdf-modal.component';
import { DEFAULT_SEO, RouteSeoData } from './route-seo.data';
import { Analytics, logEvent } from '@angular/fire/analytics';
import { ToastService, ToastMessage } from './services/toast.service';
import { ConfirmModalService, ConfirmPrompt } from './services/confirm-modal.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, HeaderComponent, FooterComponent, PdfModalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'journal-portal';
  activeToast: ToastMessage | null = null;
  confirmPrompt: ConfirmPrompt | null = null;

  private toastClear: ReturnType<typeof setTimeout> | null = null;

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private titleService: Title,
    private meta: Meta,
    private toastService: ToastService,
    private confirmModalService: ConfirmModalService,
    @Optional() private analytics: Analytics | null
  ) {}

  ngOnInit(): void {
    this.toastService.message$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((msg) => {
        this.activeToast = msg;
        if (this.toastClear) {
          clearTimeout(this.toastClear);
        }
        this.toastClear = setTimeout(() => {
          this.activeToast = null;
          this.toastClear = null;
        }, 4500);
      });

    this.confirmModalService.prompt$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((p) => (this.confirmPrompt = p));

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        const leaf = this.deepestChild(this.activatedRoute);
        const seo = leaf.snapshot.data['seo'] as RouteSeoData | undefined;
        if (seo?.title) {
          this.titleService.setTitle(seo.title);
        } else {
          this.titleService.setTitle(DEFAULT_SEO.title);
        }
        this.meta.updateTag({
          name: 'description',
          content: seo?.description ?? DEFAULT_SEO.description,
        });

        if (this.analytics) {
          logEvent(this.analytics, 'page_view', {
            page_path: e.urlAfterRedirects,
            page_title: this.titleService.getTitle(),
          });
        }
      });
  }

  dismissToast() {
    this.activeToast = null;
    if (this.toastClear) {
      clearTimeout(this.toastClear);
      this.toastClear = null;
    }
  }

  confirmYes() {
    this.confirmModalService.respond(true);
  }

  confirmNo() {
    this.confirmModalService.respond(false);
  }

  private deepestChild(route: ActivatedRoute): ActivatedRoute {
    let r = route;
    while (r.firstChild) {
      r = r.firstChild;
    }
    return r;
  }
}
