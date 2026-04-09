import { Component, OnInit } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { Title, Meta } from '@angular/platform-browser';
import { filter } from 'rxjs/operators';
import { HeaderComponent } from './components/common/header/header.component';
import { FooterComponent } from './components/common/footer/footer.component';
import { PdfModalComponent } from './components/pdf-modal/pdf-modal.component';
import { DEFAULT_SEO, RouteSeoData } from './route-seo.data';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent, PdfModalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit {
  title = 'journal-portal';

  constructor(
    private router: Router,
    private activatedRoute: ActivatedRoute,
    private titleService: Title,
    private meta: Meta
  ) {}

  ngOnInit(): void {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
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
      });
  }

  private deepestChild(route: ActivatedRoute): ActivatedRoute {
    let r = route;
    while (r.firstChild) {
      r = r.firstChild;
    }
    return r;
  }
}
