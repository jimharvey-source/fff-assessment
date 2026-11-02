// =====================================================================
// api/create-checkout.mjs  ·  fff-pro
// One-off Stripe Checkout for a stored run. £39 including VAT.
// The £19 list offer is a Stripe promotion code the buyer types at checkout
// (allow_promotion_codes): GURU19, which expires at 23:59 on 18 December 2026.
// Live ids: product prod_VXgCzHl5DZXJMu, price price_1UWaqBPNGM6yegi0lVXKr0Ch.
// Uses FFF Pro's own restricted key: Checkout Sessions (write) only.
// =====================================================================

import Stripe from 'stripe';
import { readEnv, fffAdmin, parseBody, SITE_URL } from '../lib/db.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const { values, missing } = readEnv(['STRIPE_SECRET_KEY', 'STRIPE_PRICE_PRO', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (missing.length) {
    console.error('[checkout] Missing environment configuration:', missing.join(', '));
    return res.status(500).json({ error: 'Checkout is not configured.' });
  }

  const body = parseBody(req);
  const token = body?.token;
  if (typeof token !== 'string' || token.length < 8 || token.length > 128) {
    return res.status(400).json({ error: 'Missing assessment token.' });
  }

  const stripe = new Stripe(values.STRIPE_SECRET_KEY);
  const admin = fffAdmin(values.SUPABASE_URL, values.SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: run, error: runError } = await admin
      .from('runs').select('token, email').eq('token', token).maybeSingle();
    if (runError) {
      console.error('[checkout] Run lookup failed:', runError.message);
      return res.status(500).json({ error: 'Could not start checkout. Please try again.' });
    }
    if (!run) return res.status(404).json({ error: 'That assessment could not be found. Please run it again.' });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: values.STRIPE_PRICE_PRO, quantity: 1 }],
      allow_promotion_codes: true,
      // VAT is inside the £39 (tax_behavior inclusive). Stripe Tax shows it on
      // the receipt once the GB registration is added in Stripe Tax.
      automatic_tax: { enabled: true },
      customer_email: run.email,
      client_reference_id: token,
      metadata: { run_token: token, product: 'fff-pro' },
      payment_intent_data: {
        metadata: { run_token: token, product: 'fff-pro' },
        statement_descriptor_suffix: 'FFF PRO',
      },
      success_url: `${SITE_URL}/pro-report.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/?checkout=cancelled`,
      consent_collection: { terms_of_service: 'required' },
      custom_text: {
        terms_of_service_acceptance: {
          message: 'I accept the [FFF Pro terms of sale](https://fff-assessment.themessagebusiness.com/terms) and I ask for my report to be generated straight away. I understand that once it is generated I lose my fourteen day right to cancel.',
        },
      },
    });

    // Bookkeeping only. Entitlement comes from Stripe.
    const { error: orderError } = await admin.from('orders').insert({
      stripe_session_id: session.id, token, status: 'pending', email: run.email,
    });
    if (orderError) console.error('[checkout] Could not record pending order:', orderError.message);

    return res.status(200).json({ url: session.url });
  } catch (e) {
    console.error('[checkout] Stripe error', e?.type || '', e?.message || e);
    return res.status(500).json({ error: 'Could not start checkout. Please try again.' });
  }
}
