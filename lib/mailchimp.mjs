// =====================================================================
// lib/mailchimp.mjs  ·  fff-pro
// After a report is paid for or unlocked: tag the buyer on the Presentation
// Guru audience, so campaigns can stop offering FFF Pro to people who own it.
// A buyer joins the list only if they ticked the box. Someone not on the list
// who did not tick is left alone.
// Never throws. A Mailchimp failure must not cost anyone their report.
// Env: MAILCHIMP_API_KEY (ends -us5), MAILCHIMP_LIST_ID (7ed36e13c8).
// =====================================================================
import crypto from 'node:crypto';

export async function tagBuyer({ email, name, optIn, tag }) {
  const key = process.env.MAILCHIMP_API_KEY;
  const list = process.env.MAILCHIMP_LIST_ID || '7ed36e13c8';
  if (!key || !email) return;
  const dc = key.split('-')[1];
  if (!dc) { console.error('[mailchimp] API key has no data centre suffix'); return; }
  const base = `https://${dc}.api.mailchimp.com/3.0/lists/${list}/members/${crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex')}`;
  const headers = { Authorization: 'Basic ' + Buffer.from('fff:' + key).toString('base64'), 'Content-Type': 'application/json' };
  try {
    if (optIn) {
      const r = await fetch(base, { method: 'PUT', headers, body: JSON.stringify({
        email_address: email.trim().toLowerCase(), status_if_new: 'subscribed',
        merge_fields: { FNAME: (name || '').split(/\s+/)[0] || '' },
      }) });
      if (!r.ok) { console.error('[mailchimp] upsert failed', r.status, (await r.text()).slice(0, 200)); return; }
    }
    const r = await fetch(base + '/tags', { method: 'POST', headers, body: JSON.stringify({ tags: [{ name: tag, status: 'active' }] }) });
    if (r.status === 404) return; // not on the list and did not opt in
    if (!r.ok) console.error('[mailchimp] tag failed', r.status, (await r.text()).slice(0, 200));
  } catch (e) {
    console.error('[mailchimp] request failed', e?.message || e);
  }
}
