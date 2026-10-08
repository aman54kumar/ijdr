import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { environment } from '../../environments/environment';
import { iArticle } from '../type/journals.type';
import { buildArticleSeo } from '../utils/article-seo.util';

const JSON_LD_ID = 'article-json-ld';

/** Applies per-article head tags (Scholar, OG, canonical, JSON-LD) and removes them again. */
@Injectable({ providedIn: 'root' })
export class ArticleSeoService {
  private title = inject(Title);
  private meta = inject(Meta);
  private document = inject(DOCUMENT);
  private added: HTMLMetaElement[] = [];

  apply(article: iArticle): void {
    this.clear();
    const seo = buildArticleSeo(article, environment.siteUrl);
    this.title.setTitle(seo.title);
    for (const t of seo.tags) {
      if (t.name === 'description') {
        // AppComponent owns this tag; update it in place.
        this.meta.updateTag({ name: 'description', content: t.content });
        continue;
      }
      const el = this.meta.addTag(
        t.name ? { name: t.name, content: t.content } : { property: t.property!, content: t.content },
        true
      );
      if (el) this.added.push(el);
    }
    this.setCanonical(seo.canonical);
    const script = this.document.createElement('script');
    script.type = 'application/ld+json';
    script.id = JSON_LD_ID;
    // `<` is escaped so article text can never close the script element.
    script.textContent = JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c');
    this.document.head.appendChild(script);
  }

  clear(): void {
    this.added.forEach((el) => el.remove());
    this.added = [];
    this.document.getElementById(JSON_LD_ID)?.remove();
    this.document.head.querySelector('link[rel="canonical"]')?.remove();
  }

  private setCanonical(href: string) {
    let link = this.document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = this.document.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.document.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }
}
