"use strict";
// Plain-text notification emails through Resend (https://resend.com). Content is never HTML,
// so user-supplied text cannot inject markup.
Object.defineProperty(exports, "__esModule", { value: true });
exports.oneLine = void 0;
exports.buildSubmissionEmail = buildSubmissionEmail;
exports.buildContactEmail = buildContactEmail;
exports.sendEmail = sendEmail;
/** Strip line breaks from header-like values so they cannot smuggle extra headers. */
const oneLine = (s, max = 200) => s.replace(/[\r\n]+/g, ' ').slice(0, max);
exports.oneLine = oneLine;
function buildSubmissionEmail(s, from, to, adminUrl) {
    return {
        from,
        to,
        replyTo: s.email,
        subject: (0, exports.oneLine)(`New manuscript submission: ${s.title}`, 150),
        text: [
            'A new manuscript was submitted through the website.',
            '',
            `Title: ${s.title}`,
            `Author: ${s.name} <${s.email}>`,
            `Affiliation: ${s.affiliation}`,
            `Keywords: ${s.keywords.join(', ')}`,
            `Files: ${s.files.map((f) => `${f.name} (${Math.round(f.size / 1024)} KB)`).join('; ')}`,
            `Reference: ${s.id}`,
            '',
            `Review it in the admin panel: ${adminUrl}`,
        ].join('\n'),
    };
}
function buildContactEmail(c, from, to, adminUrl) {
    return {
        from,
        to,
        replyTo: c.email,
        subject: (0, exports.oneLine)(`New contact message from ${c.name}`, 150),
        text: [`From: ${c.name} <${c.email}>`, '', c.message.slice(0, 3000), '', `Open the inbox: ${adminUrl}`].join('\n'),
    };
}
/** Send via Resend. Returns true on success; failures are logged, never thrown (email is best effort). */
async function sendEmail(apiKey, m, fetchFn = fetch) {
    if (!apiKey || !m.to)
        return false;
    try {
        const res = await fetchFn('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, text: m.text, reply_to: m.replyTo }),
        });
        if (!res.ok) {
            console.error('Resend rejected the email', res.status, (await res.text()).slice(0, 200));
            return false;
        }
        return true;
    }
    catch (e) {
        console.error('Resend request failed', e.message);
        return false;
    }
}
//# sourceMappingURL=email.js.map