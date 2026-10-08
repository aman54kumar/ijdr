import { parseRecipients } from './admin-notifications.component';

describe('parseRecipients', () => {
  it('splits on newlines, commas, semicolons and spaces, lower-cases and de-duplicates', () => {
    expect(parseRecipients('A@x.co, b@x.co;\nc@x.co  a@x.co').valid).toEqual(['a@x.co', 'b@x.co', 'c@x.co']);
  });

  it('reports invalid entries', () => {
    const r = parseRecipients('ok@x.co, nope, two@@x.co');
    expect(r.valid).toEqual(['ok@x.co']);
    expect(r.invalid).toEqual(['nope', 'two@@x.co']);
  });

  it('treats blank input as an empty list', () => {
    expect(parseRecipients('  \n ')).toEqual({ valid: [], invalid: [] });
  });
});
