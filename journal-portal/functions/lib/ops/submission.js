"use strict";
// Validation for manuscript submissions (unit tested in ops.test.ts).
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUBMISSION_STATUSES = exports.ALLOWED_EXT = exports.MAX_COVER_BYTES = exports.MAX_MANUSCRIPT_BYTES = void 0;
exports.validateSubmissionFields = validateSubmissionFields;
exports.fileExtension = fileExtension;
exports.safeDisplayName = safeDisplayName;
exports.validateFile = validateFile;
exports.MAX_MANUSCRIPT_BYTES = 15 * 1024 * 1024;
exports.MAX_COVER_BYTES = 5 * 1024 * 1024;
exports.ALLOWED_EXT = ['pdf', 'doc', 'docx'];
const EMAIL = /^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$/;
const clean = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '';
/** Returns the cleaned fields or a list of problems (messages are shown to the author). */
function validateSubmissionFields(raw) {
    const errors = [];
    const name = clean(raw['name'], 200);
    const email = clean(raw['email'], 320);
    const affiliation = clean(raw['affiliation'], 300);
    const phone = clean(raw['phone'], 40);
    const title = clean(raw['title'], 400);
    const abstract = clean(raw['abstract'], 4000);
    const note = clean(raw['note'], 2000);
    const keywords = clean(raw['keywords'], 500)
        .split(/[,;\n]/)
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 10);
    if (!name)
        errors.push('Your name is required.');
    if (!EMAIL.test(email))
        errors.push('A valid email address is required.');
    if (!affiliation)
        errors.push('Your affiliation is required.');
    if (title.length < 5)
        errors.push('The manuscript title is required.');
    if (abstract.length < 100)
        errors.push('The abstract must be at least 100 characters.');
    if (keywords.length < 2)
        errors.push('Give at least two keywords, separated by commas.');
    if (raw['consent'] !== 'true')
        errors.push('You must confirm the declaration (original work, not under review elsewhere).');
    if (errors.length)
        return { ok: false, errors };
    return { ok: true, value: { name, email, affiliation, ...(phone ? { phone } : {}), title, abstract, keywords, ...(note ? { note } : {}) } };
}
function fileExtension(filename) {
    const m = /\.([A-Za-z0-9]{1,5})$/.exec(filename.trim());
    return m ? m[1].toLowerCase() : '';
}
/** Keep the display name harmless: no paths, no control characters, bounded length. */
function safeDisplayName(filename) {
    return filename.replace(/[\u0000-\u001f\\/]+/g, '_').trim().slice(0, 120) || 'file';
}
/** Check extension, size and the file's real signature (not just its name). */
function validateFile(kind, filename, bytes) {
    const label = kind === 'manuscript' ? 'The manuscript' : 'The cover letter';
    const max = kind === 'manuscript' ? exports.MAX_MANUSCRIPT_BYTES : exports.MAX_COVER_BYTES;
    const ext = fileExtension(filename);
    if (!exports.ALLOWED_EXT.includes(ext))
        return { ok: false, error: `${label} must be a PDF, DOC or DOCX file.` };
    if (bytes.length === 0)
        return { ok: false, error: `${label} file is empty.` };
    if (bytes.length > max)
        return { ok: false, error: `${label} must be smaller than ${max / 1048576} MB.` };
    const head = bytes.subarray(0, 8);
    const isPdf = head.subarray(0, 4).toString('latin1') === '%PDF';
    const isZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
    const isOle = head.toString('hex') === 'd0cf11e0a1b11ae1';
    const okSig = (ext === 'pdf' && isPdf) || (ext === 'docx' && isZip) || (ext === 'doc' && isOle);
    if (!okSig)
        return { ok: false, error: `${label} does not look like a real ${ext.toUpperCase()} file.` };
    const contentType = ext === 'pdf' ? 'application/pdf' : ext === 'doc' ? 'application/msword' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    return { ok: true, ext: ext, contentType };
}
exports.SUBMISSION_STATUSES = ['received', 'under_review', 'revision', 'accepted', 'rejected'];
//# sourceMappingURL=submission.js.map