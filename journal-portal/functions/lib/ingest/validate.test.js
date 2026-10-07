"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const validate_1 = require("./validate");
const fixture = {
    totalPdfPages: 60,
    pageOffset: 4,
    articles: [
        {
            title: '  Microfinance and Rural Credit  ',
            authors: [{ name: 'A. K. Sharma', affiliation: 'Delhi University' }, { name: '  ' }],
            abstract: null,
            keywords: ['Credit', ' ', 'Rural'],
            subject: null,
            pageStart: 1,
            pageEnd: 12,
            language: 'en',
            confidence: 1.4,
        },
        { title: '', authors: [], keywords: [] },
        { title: 'Out of range', authors: [{ name: 'X' }], keywords: [], pageStart: 70, pageEnd: 80 },
        { title: 'ग्रामीण विकास', authors: [{ name: 'सुनीता' }], keywords: [], pageStart: 13, language: 'hi' },
    ],
};
(0, node_test_1.default)('validates, converts printed pages to PDF pages and drops bad rows', () => {
    const v = (0, validate_1.validateIngestResponse)(fixture);
    strict_1.default.equal(v.articles.length, 3);
    const [a, b, c] = v.articles;
    strict_1.default.equal(a.title, 'Microfinance and Rural Credit');
    strict_1.default.deepEqual(a.authors, [{ name: 'A. K. Sharma', affiliation: 'Delhi University' }]);
    strict_1.default.deepEqual(a.keywords, ['Credit', 'Rural']);
    strict_1.default.equal(a.abstract, undefined);
    strict_1.default.equal(a.pageStart, 5);
    strict_1.default.equal(a.pageEnd, 16);
    strict_1.default.equal(a.confidence, 1);
    strict_1.default.equal(b.pageStart, undefined);
    strict_1.default.equal(c.pageStart, 17);
    strict_1.default.equal(c.pageEnd, 17);
    strict_1.default.ok(v.warnings.some((w) => w.includes('no title')));
    strict_1.default.ok(v.warnings.some((w) => w.includes('out of range')));
});
(0, node_test_1.default)('rejects unusable payloads', () => {
    strict_1.default.throws(() => (0, validate_1.validateIngestResponse)(null));
    strict_1.default.throws(() => (0, validate_1.validateIngestResponse)({ articles: 'x' }));
    strict_1.default.throws(() => (0, validate_1.validateIngestResponse)({ pageOffset: 0, articles: [] }));
});
(0, node_test_1.default)('re-run replaces only untouched AI drafts', () => {
    const plan = (0, validate_1.planReplacement)([
        { id: '1', source: 'ai', status: 'draft', order: 1 },
        { id: '2', source: 'ai', status: 'draft', humanEdited: true, order: 2 },
        { id: '3', source: 'ai', status: 'published', order: 3 },
        { id: '4', source: 'manual', status: 'draft', order: 4 },
    ]);
    strict_1.default.deepEqual(plan.deleteIds, ['1']);
    strict_1.default.equal(plan.keptCount, 3);
    strict_1.default.equal(plan.nextOrder, 5);
});
(0, node_test_1.default)('drops drafts duplicating kept titles', () => {
    const r = (0, validate_1.dropDuplicatesOfKept)([{ title: 'Rural Credit!', authors: [], keywords: [] }, { title: 'New', authors: [], keywords: [] }], ['rural credit']);
    strict_1.default.equal(r.skipped, 1);
    strict_1.default.equal(r.drafts[0].title, 'New');
});
//# sourceMappingURL=validate.test.js.map