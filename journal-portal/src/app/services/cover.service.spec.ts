import { TestBed } from '@angular/core/testing';
import { CoverService } from './cover.service';
import { FirebaseJournalService } from './firebase-journal.service';
import { FIREBASE_SDK_STUBS } from '../testing/firebase-stubs';

/** One-page A4 PDF with a line of text (xref is rebuilt by pdf.js if needed). */
function tinyPdf(): ArrayBuffer {
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length 44 >>\nstream\nBT /F1 36 Tf 72 700 Td (IJDR cover) Tj ET\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((o) => (body += `${String(o).padStart(10, '0')} 00000 n \n`));
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body).buffer as ArrayBuffer;
}

describe('CoverService', () => {
  let service: CoverService;
  const saved: { id: string; blob: Blob }[] = [];

  beforeEach(() => {
    saved.length = 0;
    TestBed.configureTestingModule({
      providers: [
        ...FIREBASE_SDK_STUBS,
        {
          provide: FirebaseJournalService,
          useValue: {
            saveJournalCover: async (id: string, blob: Blob) => {
              saved.push({ id, blob });
              return 'https://example.org/cover.jpg';
            },
          },
        },
      ],
    });
    service = TestBed.inject(CoverService);
  });

  it('renders page 1 to a 400px-wide JPEG', async () => {
    const blob = await service.renderCover(tinyPdf());
    expect(blob.type).toBe('image/jpeg');
    expect(blob.size).toBeGreaterThan(1000);
    const bmp = await createImageBitmap(blob);
    expect(bmp.width).toBe(400);
    expect(bmp.height).toBe(Math.floor((842 * 400) / 595));
  });

  it('uploads the generated cover for the given issue', async () => {
    const file = new File([tinyPdf()], 'x.pdf', { type: 'application/pdf' });
    const url = await service.generateFromFile('issue1', file);
    expect(url).toBe('https://example.org/cover.jpg');
    expect(saved.map((s) => s.id)).toEqual(['issue1']);
  });

  it('backfill skips issues that already have a cover and continues past failures', async () => {
    spyOn(service, 'generateFromStored').and.callFake(async (j) => {
      if (j.id === 'bad') throw new Error('boom');
      return 'ok';
    });
    const progress: number[] = [];
    const res = await service.backfillMissing(
      [
        { id: 'a', title: 'A', volume: 1, number: 1, year: '2020', pdfUrl: 'u' },
        { id: 'has', title: 'H', volume: 1, number: 2, year: '2020', pdfUrl: 'u', coverUrl: 'c' },
        { id: 'bad', title: 'B', volume: 2, number: 1, year: '2021', pdfUrl: 'u' },
      ],
      (done) => progress.push(done)
    );
    expect(res).toEqual({ done: 1, failed: ['B'], reason: 'boom' });
    expect(progress).toEqual([1, 2]);
  });
});
