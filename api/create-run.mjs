// =====================================================================
// api/create-run.mjs  ·  fff-pro
// Stores a completed assessment and returns a short token. The browser
// sends the sixty raw answers; the server scores them (lib/scoring.mjs).
// Open by necessity: the buyer has not paid yet.
// =====================================================================

import crypto from 'node:crypto';
import { readEnv, fffAdmin, parseBody } from '../lib/db.mjs';
import { scoreAnswers } from '../lib/scoring.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });

  const { values, missing } = readEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (missing.length) {
    console.error('[create-run] Missing environment configuration:', missing.join(', '));
    return res.status(500).json({ error: 'Not configured.' });
  }

  const body = parseBody(req);
  if (!body) return res.status(400).json({ error: 'Invalid JSON.' });
  const { name, email, answers } = body;
  const marketing = body.marketing === true;

  if (typeof name !== 'string' || name.trim().length < 2 || name.length > 80) {
    return res.status(400).json({ error: 'A name is required.' });
  }
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const scoring = scoreAnswers(answers);
  if (!scoring) return res.status(400).json({ error: 'The answers are incomplete. Please finish the assessment.' });

  const admin = fffAdmin(values.SUPABASE_URL, values.SUPABASE_SERVICE_ROLE_KEY);
  const token = crypto.randomBytes(16).toString('base64url');

  const { error } = await admin.from('runs').insert({
    token,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    answers,
    scoring,
    scoring_version: scoring.version,
    marketing_opt_in: marketing,
  });

  if (error) {
    // Never a silent success: without the row there is nothing to sell.
    console.error('[create-run] Insert failed:', error.message);
    return res.status(500).json({ error: 'Could not save your answers. Please try again.' });
  }

  return res.status(200).json({ token, key: scoring.key, profileName: scoring.profileName });
}
