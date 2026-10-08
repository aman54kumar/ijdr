"use strict";
// Plain-text notification emails through Resend (https://resend.com). Content is never HTML,
// so user-supplied text cannot inject markup.
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_RECIPIENTS = exports.oneLine = void 0;
exports.parseEmailList = parseEmailList;
exports.resolveNotifySettings = resolveNotifySettings;
exports.buildSubmissionEmail = buildSubmissionEmail;
exports.buildContactEmail = buildContactEmail;
exports.sendEmail = sendEmail;
exports.buildTestEmail = buildTestEmail;
/** Strip line breaks from header-like values so they cannot smuggle extra headers. */
const oneLine = (s, max = 200) => s.replace(/[\r\n]+/g, ' ').slice(0, max);
exports.oneLine = oneLine;
const EMAIL_RE = /^[^@\s,;<>"]{1,64}@[^@\s,;<>"]+\.[^@\s,;<>"]{2,}$/;
exports.MAX_RECIPIENTS = 5;
/** Split on commas/semicolons/whitespace, lower-case, drop invalid and duplicate addresses. */
function parseEmailList(raw) {
    const parts = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? raw.split(/[\s,;]+/) : [];
    const out = [];
    for (const p of parts) {
        const e = p.trim().toLowerCase();
        if (e && e.length <= 254 && EMAIL_RE.test(e) && !out.includes(e))
            out.push(e);
    }
    return out.slice(0, exports.MAX_RECIPIENTS);
}
/**
 * Notification settings from the admin-only `adminSettings/notifications` doc. When the admin has
 * not saved a recipient list, the deploy-time default (NOTIFY_EMAIL_TO) is used.
 */
function resolveNotifySettings(raw, envDefault) {
    const saved = raw && Array.isArray(raw['emails']) ? parseEmailList(raw['emails']) : null;
    return {
        emails: saved ?? parseEmailList(envDefault),
        onSubmission: raw?.['onSubmission'] !== false,
        onContact: raw?.['onContact'] !== false,
    };
}
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
    if (!apiKey || !m.to.length)
        return false;
    try {
        const res = await fetchFn('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: m.from, to: m.to, subject: m.subject, text: m.text, reply_to: m.replyTo }),
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
function buildTestEmail(from, to, by) {
    return {
        from,
        to,
        subject: 'IJDR notification test',
        text: `This is a test message from the IJDR admin panel, requested by ${(0, exports.oneLine)(by)}.\n\nIf you can read this, notifications are working.`,
    };
}
//# sourceMappingURL=email.js.map