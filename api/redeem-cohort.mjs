// =====================================================================
// api/redeem-cohort.mjs  ·  fff-pro
// Unlocks a stored run with a programme code instead of a card. The client
// is invoiced per seat from fff.seat_report. Stripe is never involved.
// Guessing is throttled: ten failed codes an hour from one address, then
// every attempt is refused for the rest of the hour.
// =====================================================================

import crypto from 'node:crypto';
import { readEnv, fffAdmin, parseBody, SITE_URL } from '../lib/db.mjs';
import { tagBuyer } from '../lib/mailchimp.mjs';

const REFUSED = 'That code is not valid. Check it with whoever runs your programme.';
const MAX_FAILS_PER_HOUR = 10;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const { values, missing } = readEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (missing.length) {
    console.error('[cohort] Missing environment configuration:', missing.join(', '));
    return res.status(500).json({ error: 'Programme codes are not configured.' });
  }

  const body = parseBody(req);
  const token = body?.token;
  if (typeof token !== 'string' || token.length < 8 || token.length > 128) {
    return res.status(400).json({ error: 'Missing assessment token.' });
  }
  const code = (typeof body?.code === 'string' ? body.code : '').trim().toUpperCase().replace(/\s+/g, '');

  const admin = fffAdmin(values.SUPABASE_URL, values.SUPABASE_SERVICE_ROLE_KEY);
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const ipHash = crypto.createHash('sha256').update('fff:' + ip).digest('hex').slice(0, 32);
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();

  const logFail = async () => {
    const { error } = await admin.from('code_attempts').insert({ ip_hash: ipHash });
    if (error) console.error('[cohort] Could not log failed attempt:', error.message);
  };

  try {
    const { count, error: countError } = await admin
      .from('code_attempts').select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).gte('at', hourAgo);
    if (countError) console.error('[cohort] Throttle check failed:', countError.message);
    if ((count || 0) >= MAX_FAILS_PER_HOUR) {
      console.error('[cohort] Throttled', ipHash);
      return res.status(429).json({ error: 'Too many attempts. Please try again in an hour.' });
    }

    if (code.length < 4 || code.length > 32 || !/^[A-Z0-9_-]+$/.test(code)) {
      await logFail();
      return res.status(400).json({ error: REFUSED });
    }

    const { data: run, error: runError } = await admin
      .from('runs').select('token, email, name, marketing_opt_in').eq('token', token).maybeSingle();
    if (runError) {
      console.error('[cohort] Run lookup failed:', runError.message);
      return res.status(500).json({ error: 'Could not unlock the report. Please try again.' });
    }
    if (!run) return res.status(404).json({ error: 'That assessment could not be found. Please run it again.' });

    // Already unlocked? Same receipt, no second seat.
    const { data: existing } = await admin
      .from('orders').select('stripe_session_id')
      .eq('token', token).eq('status', 'paid').not('cohort_code', 'is', null)
      .limit(1).maybeSingle();
    if (existing) {
      return res.status(200).json({ url: `${SITE_URL}/pro-report.html?session_id=${encodeURIComponent(existing.stripe_session_id)}` });
    }

    const { data: redeemed, error: redeemError } = await admin.rpc('redeem_cohort_code', { p_code: code });
    if (redeemError) {
      console.error('[cohort] redeem_cohort_code failed:', redeemError.message);
      return res.status(500).json({ error: 'Could not unlock the report. Please try again.' });
    }
    const row = Array.isArray(redeemed) ? redeemed[0] : redeemed;
    if (!row || !row.label) {
      console.error('[cohort] Code refused:', code);
      await logFail();
      return res.status(403).json({ error: REFUSED });
    }

    const orderId = 'coh_' + crypto.randomBytes(16).toString('base64url');
    const { error: orderError } = await admin.from('orders').insert({
      stripe_session_id: orderId, token, status: 'paid', amount_total: 0, currency: 'gbp',
      cohort_code: code, email: run.email, paid_at: new Date().toISOString(),
    });
    if (orderError) {
      console.error('[cohort] Could not record order:', orderError.message);
      const { error: releaseError } = await admin.rpc('release_cohort_code', { p_code: code });
      if (releaseError) console.error('[cohort] Could not release seat:', releaseError.message);
      return res.status(500).json({ error: 'Could not unlock the report. Please try again.' });
    }

    await tagBuyer({ email: run.email, name: run.name, optIn: run.marketing_opt_in, tag: 'FFF Pro programme' });
    console.log('[cohort] Redeemed', code, 'order', orderId, '(' + row.label + ')');
    return res.status(200).json({ url: `${SITE_URL}/pro-report.html?session_id=${encodeURIComponent(orderId)}`, label: row.label });
  } catch (e) {
    console.error('[cohort] Unexpected error', e?.message || e);
    return res.status(500).json({ error: 'Could not unlock the report. Please try again.' });
  }
}
