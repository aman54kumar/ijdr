// Plain-text notification emails through Resend (https://resend.com). Content is never HTML,
// so user-supplied text cannot inject markup.

export interface EmailMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

/** Strip line breaks from header-like values so they cannot smuggle extra headers. */
export const oneLine = (s: string, max = 200) => s.replace(/[\r\n]+/g, ' ').slice(0, max);

export function buildSubmissionEmail(
  s: { id: string; name: string; email: string; affiliation: string; title: string; keywords: string[]; files: { name: string; size: number }[] },
  from: string,
  to: string,
  adminUrl: string
): EmailMessage {
  return {
    from,
    to,
    replyTo: s.email,
    subject: oneLine(`New manuscript submission: ${s.title}`, 150),
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

export function buildContactEmail(
  c: { name: string; email: string; message: string },
  from: string,
  to: string,
  adminUrl: string
): EmailMessage {
  return {
    from,
    to,
    replyTo: c.email,
    subject: oneLine(`New contact message from ${c.name}`, 150),
    text: [`From: ${c.name} <${c.email}>`, '', c.message.slice(0, 3000), '', `Open the inbox: ${adminUrl}`].join('\n'),
  };
}

/** Send via Resend. Returns true on success; failures are logged, never thrown (email is best effort). */
export async function sendEmail(apiKey: string, m: EmailMessage, fetchFn: typeof fetch = fetch): Promise<boolean> {
  if (!apiKey || !m.to) return false;
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
  } catch (e) {
    console.error('Resend request failed', (e as Error).message);
    return false;
  }
}
