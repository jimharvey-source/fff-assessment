// Shared helpers. Initialise inside each handler: module-level init has
// failed intermittently on Vercel's runtime in earlier builds.
import { createClient } from '@supabase/supabase-js';

export function readEnv(names) {
  const values = Object.fromEntries(names.map(n => [n, process.env[n]]));
  const missing = names.filter(n => !values[n]);
  return { values, missing };
}

export function fffAdmin(url, key) {
  return createClient(url, key, { auth: { persistSession: false }, db: { schema: 'fff' } });
}

export function parseBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return null; }
  }
  return body || {};
}

export const SITE_URL = process.env.SITE_URL || 'https://fff-assessment.themessagebusiness.com';
