// =====================================================================
// api/generate-report.mjs  ·  fff-pro
//
// Builds and serves the FFF Pro PDF for a paid card session (cs_) or a
// programme seat (coh_). The gate follows OSCI Pro: for a card sale Stripe
// says whether it was paid; for a seat, the order row redeem-cohort wrote.
//
// The three personal paragraphs are written once and stored on the run, so
// a second download is the same report and costs no model call.
// =====================================================================

import Stripe from 'stripe';
import { readFileSync } from 'node:fs';
import { readEnv, fffAdmin, parseBody } from '../lib/db.mjs';
import { renderReport } from '../lib/report.mjs';
import { writePersonal } from '../lib/narrative.mjs';

const CONTENT = JSON.parse(readFileSync(new URL('../content/advice.json', import.meta.url), 'utf8'));
const MAX_GENERATIONS = 20;
const STORY_URL = process.env.STORYMACHINE_URL || 'storymachine.themessagebusiness.com/fffpro';

const ukDate = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
const fileName = name => `FFF-Pro-Report-${name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Report'}.pdf`;

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const { values, missing } = readEnv(['STRIPE_SECRET_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (missing.length) {
    console.error('[report] Missing environment configuration:', missing.join(', '));
    return res.status(500).json({ error: 'Report generation is not configured.' });
  }

  const body = parseBody(req) || {};
  const sessionId = body.session_id || req.query?.session_id;
  const isStripe = typeof sessionId === 'string' && sessionId.startsWith('cs_');
  const isCohort = typeof sessionId === 'string' && sessionId.startsWith('coh_');
  if (!isStripe && !isCohort) return res.status(400).json({ error: 'Missing order reference.' });

  const admin = fffAdmin(values.SUPABASE_URL, values.SUPABASE_SERVICE_ROLE_KEY);
  let token = null;
  let orderValue = null;

  // ---- the gate ---------------------------------------------------------
  if (isStripe) {
    let session;
    try { session = await new Stripe(values.STRIPE_SECRET_KEY).checkout.sessions.retrieve(sessionId); }
    catch (e) {
      console.error('[report] Session lookup failed:', e?.message);
      return res.status(404).json({ error: 'That payment could not be found.' });
    }
    if (session.payment_status !== 'paid') return res.status(402).json({ error: 'This report has not been paid for.' });
    token = session.metadata?.run_token || session.client_reference_id;
    orderValue = session.amount_total;
    if (!token) {
      console.error('[report] Paid session carries no run_token:', sessionId);
      return res.status(500).json({ error: 'Your payment went through, but the assessment could not be matched. Please email jim.harvey@themessagebusiness.com.' });
    }
  } else {
    const { data: order, error } = await admin.from('orders').select('token, status, cohort_code').eq('stripe_session_id', sessionId).maybeSingle();
    if (error) {
      console.error('[report] Seat lookup failed:', error.message);
      return res.status(500).json({ error: 'Could not check your programme code. Please try again.' });
    }
    if (!order || !order.cohort_code || order.status !== 'paid') return res.status(404).json({ error: 'That programme unlock could not be found.' });
    token = order.token;
  }

  const { data: run, error: runError } = await admin.from('runs').select('name, scoring, narrative, created_at').eq('token', token).maybeSingle();
  if (runError || !run) {
    console.error('[report] Run lookup failed:', runError?.message || 'no row', token);
    return res.status(500).json({ error: 'Your answers could not be found. Please email jim.harvey@themessagebusiness.com.' });
  }

  // A card order row may not exist yet if the webhook is late: make one.
  const { data: order } = await admin.from('orders').select('generation_count, first_generated_at').eq('stripe_session_id', sessionId).maybeSingle();
  if ((order?.generation_count || 0) >= MAX_GENERATIONS) {
    console.error('[report] Generation cap reached:', sessionId);
    return res.status(429).json({ error: 'This report has been downloaded many times. Please email jim.harvey@themessagebusiness.com for a copy.' });
  }

  // ---- the words --------------------------------------------------------
  const firstName = run.name.split(/\s+/)[0];
  let personal = run.narrative;
  if (!personal) {
    personal = await writePersonal(run.scoring, firstName, { apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5' });
    const { error } = await admin.from('runs').update({ narrative: personal }).eq('token', token);
    if (error) console.error('[report] Could not store narrative:', error.message);
  }

  let pdf;
  try {
    pdf = await renderReport({ name: run.name, scoring: run.scoring, content: CONTENT, personal, storyUrl: STORY_URL, date: ukDate(new Date(run.created_at)) });
  } catch (e) {
    console.error('[report] Render failed:', e?.stack || e);
    return res.status(500).json({ error: 'The report could not be built. Please try again in a minute.' });
  }

  const now = new Date().toISOString();
  const { error: countError } = await admin.from('orders').upsert({
    stripe_session_id: sessionId, token, status: 'paid',
    generation_count: (order?.generation_count || 0) + 1,
    first_generated_at: order?.first_generated_at || now, last_generated_at: now, updated_at: now,
  }, { onConflict: 'stripe_session_id' });
  if (countError) console.error('[report] Could not record generation:', countError.message);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName(run.name)}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  if (orderValue != null) res.setHeader('X-Order-Value', String(orderValue));
  return res.status(200).send(pdf);
}
