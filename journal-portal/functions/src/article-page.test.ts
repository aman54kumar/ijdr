import test from 'node:test';
import assert from 'node:assert/strict';
import { injectArticleHead, escapeHtml } from './article-page';
import { buildArticleSeo } from './article-seo';

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
const shell =
  '<!doctype html><html><head><title>IJDR</title><meta name="description" content="old"><link rel="canonical" href="x"></head><body><app-root></app-root></body></html>';

test('injects escaped Scholar tags, canonical and JSON-LD into the shell', () => {
  const seo = buildArticleSeo(article, 'https://ijdrpub.in');
  const html = injectArticleHead(shell, article, seo);
  assert.match(html, /<title>Rural &lt;Credit&gt; &amp; &quot;Banks&quot; \| IJDR<\/title>/);
  assert.match(html, /<meta name="citation_title" content="Rural &lt;Credit&gt; &amp; &quot;Banks&quot;">/);
  assert.match(html, /<meta name="citation_author" content="A\. K\. Sharma">/);
  assert.match(html, /<meta name="citation_firstpage" content="5">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/ijdrpub\.in\/article\/abc">/);
  assert.equal(html.match(/rel="canonical"/g)?.length, 1);
  assert.equal(html.match(/name="description"/g)?.length, 1);
  assert.ok(!html.includes('content="old"'));
  assert.match(html, /<app-root><\/app-root>/);
});

test('article text cannot break out of the JSON-LD script or markup', () => {
  const html = injectArticleHead(shell, article, buildArticleSeo(article, 'https://ijdrpub.in'));
  assert.ok(!html.includes('</script><script>alert'));
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1];
  assert.equal(JSON.parse(ld)['@type'], 'ScholarlyArticle');
  assert.equal(escapeHtml('<&>"'), '&lt;&amp;&gt;&quot;');
});
