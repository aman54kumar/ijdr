"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const article_page_1 = require("./article-page");
const article_seo_1 = require("./article-seo");
const article = {
    id: 'abc',
    issueId: 'iss1',
    title: 'Rural <Credit> & "Banks"',
    authors: [{ name: 'A. K. Sharma' }],
    abstract: 'About </script><script>alert(1)</script>',
    keywords: ['credit'],
    pageStart: 5,
    issueVolume: 16,
    issueNumber: 1,
    issueYear: '2024',
};
const shell = '<!doctype html><html><head><title>IJDR</title><meta name="description" content="old"><link rel="canonical" href="x"></head><body><app-root></app-root></body></html>';
(0, node_test_1.default)('injects escaped Scholar tags, canonical and JSON-LD into the shell', () => {
    const seo = (0, article_seo_1.buildArticleSeo)(article, 'https://ijdrpub.in');
    const html = (0, article_page_1.injectArticleHead)(shell, article, seo);
    strict_1.default.match(html, /<title>Rural &lt;Credit&gt; &amp; &quot;Banks&quot; \| IJDR<\/title>/);
    strict_1.default.match(html, /<meta name="citation_title" content="Rural &lt;Credit&gt; &amp; &quot;Banks&quot;">/);
    strict_1.default.match(html, /<meta name="citation_author" content="A\. K\. Sharma">/);
    strict_1.default.match(html, /<meta name="citation_firstpage" content="5">/);
    strict_1.default.match(html, /<link rel="canonical" href="https:\/\/ijdrpub\.in\/article\/abc">/);
    strict_1.default.equal(html.match(/rel="canonical"/g)?.length, 1);
    strict_1.default.equal(html.match(/name="description"/g)?.length, 1);
    strict_1.default.ok(!html.includes('content="old"'));
    strict_1.default.match(html, /<app-root><\/app-root>/);
});
(0, node_test_1.default)('article text cannot break out of the JSON-LD script or markup', () => {
    const html = (0, article_page_1.injectArticleHead)(shell, article, (0, article_seo_1.buildArticleSeo)(article, 'https://ijdrpub.in'));
    strict_1.default.ok(!html.includes('</script><script>alert'));
    const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];
    strict_1.default.equal(JSON.parse(ld)['@type'], 'ScholarlyArticle');
    strict_1.default.equal((0, article_page_1.escapeHtml)('<&>"'), '&lt;&amp;&gt;&quot;');
});
//# sourceMappingURL=article-page.test.js.map