"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeHtml = escapeHtml;
exports.injectArticleHead = injectArticleHead;
function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function tagHtml(t) {
    const attr = t.name ? `name="${escapeHtml(t.name)}"` : `property="${escapeHtml(t.property ?? '')}"`;
    return `<meta ${attr} content="${escapeHtml(t.content)}">`;
}
/**
 * Put one article's head tags into the built SPA shell (`index.html`) so crawlers that do not
 * run JavaScript (Google Scholar, social previews) still see them. The Angular app then
 * takes over and re-applies the same tags in the browser.
 */
function injectArticleHead(indexHtml, article, seo) {
    let html = indexHtml
        .replace(/<title>[\s\S]*?<\/title>/i, '')
        .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
        .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '');
    const head = `<title>${escapeHtml(seo.title)}</title>` +
        `<link rel="canonical" href="${escapeHtml(seo.canonical)}">` +
        seo.tags.map(tagHtml).join('') +
        // `<` is escaped so article text can never close the script element.
        `<script type="application/ld+json">${JSON.stringify(seo.jsonLd).replace(/</g, '\\u003c')}</script>`;
    html = html.replace(/<\/head>/i, `${head}</head>`);
    const authors = article.authors.map((a) => escapeHtml(a.name)).join(', ');
    const body = `<noscript><article><h1>${escapeHtml(article.title)}</h1>` +
        (authors ? `<p>${authors}</p>` : '') +
        (article.abstract ? `<p>${escapeHtml(article.abstract)}</p>` : '') +
        `<p>${escapeHtml(seo.description)}</p></article></noscript>`;
    return html.replace(/<\/body>/i, `${body}</body>`);
}
//# sourceMappingURL=article-page.js.map