"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const pure_1 = require("./pure");
(0, node_test_1.default)('kill switches default to off', () => {
    strict_1.default.deepEqual((0, pure_1.parseAiSettings)(undefined), { summaries: false, translation: false, chat: false, semanticSearch: false });
    strict_1.default.deepEqual((0, pure_1.parseAiSettings)({ chat: true, summaries: 'yes' }), { summaries: false, translation: false, chat: true, semanticSearch: false });
});
(0, node_test_1.default)('day and visitor keys', () => {
    strict_1.default.equal((0, pure_1.dayKey)(new Date('2026-10-07T23:59:59Z')), '2026-10-07');
    const a = (0, pure_1.visitorKey)('1.2.3.4', 's');
    strict_1.default.equal(a, (0, pure_1.visitorKey)('1.2.3.4', 's'));
    strict_1.default.notEqual(a, (0, pure_1.visitorKey)('1.2.3.5', 's'));
    strict_1.default.ok(!a.includes('1.2.3.4'));
});
(0, node_test_1.default)('cleans questions', () => {
    strict_1.default.equal((0, pure_1.cleanQuestion)('  What   is\n the finding? '), 'What is the finding?');
    strict_1.default.equal((0, pure_1.cleanQuestion)('hi'), null);
    strict_1.default.equal((0, pure_1.cleanQuestion)(42), null);
    strict_1.default.equal((0, pure_1.cleanQuestion)('x'.repeat(1000)).length, 400);
});
(0, node_test_1.default)('chat answers must cite valid pages and are mapped to file pages', () => {
    const ok = (0, pure_1.validateChat)({ answerable: true, answer: 'Yes.', pages: [2, 2, 9, 0, 1.5, 3] }, 10, 4);
    strict_1.default.deepEqual(ok, { answerable: true, answer: 'Yes.', pages: [11, 12] });
    const noCite = (0, pure_1.validateChat)({ answerable: true, answer: 'Yes.', pages: [99] }, 10, 4);
    strict_1.default.equal(noCite.answerable, false);
    strict_1.default.deepEqual(noCite.pages, []);
    const refused = (0, pure_1.validateChat)({ answerable: false, answer: 'Not covered.', pages: [1] }, 10, 4);
    strict_1.default.deepEqual(refused, { answerable: false, answer: 'Not covered.', pages: [] });
    strict_1.default.equal((0, pure_1.validateChat)(null, 1, 1).answerable, false);
});
(0, node_test_1.default)('summary validation', () => {
    strict_1.default.deepEqual((0, pure_1.validateSummary)({ text: ' Hi ', keyPoints: ['a', '', 3] }), { text: 'Hi', keyPoints: ['a'] });
    strict_1.default.throws(() => (0, pure_1.validateSummary)({ text: '', keyPoints: [] }));
});
(0, node_test_1.default)('similarity ranking', () => {
    strict_1.default.equal((0, pure_1.cosine)([1, 0], [1, 0]), 1);
    strict_1.default.equal((0, pure_1.cosine)([1, 0], [0, 1]), 0);
    strict_1.default.equal((0, pure_1.cosine)([], [1]), 0);
    const items = [
        { id: 'a', vector: [1, 0] },
        { id: 'b', vector: [0.9, 0.1] },
        { id: 'c', vector: [0, 1] },
        { id: 'self', vector: [1, 0] },
    ];
    strict_1.default.deepEqual((0, pure_1.topK)([1, 0], items, 5, 'self').map((x) => x.id), ['a', 'b']);
});
(0, node_test_1.default)('embedding text', () => {
    strict_1.default.equal((0, pure_1.embeddingText)({ title: 'T', abstract: 'A', keywords: ['k1', 'k2'] }), 'T\n\nA\n\nk1, k2');
    strict_1.default.equal((0, pure_1.embeddingText)({ title: 'T' }), 'T');
});
//# sourceMappingURL=ai.test.js.map