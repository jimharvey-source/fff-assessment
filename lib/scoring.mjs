// =====================================================================
// lib/scoring.mjs  ·  fff-pro
//
// Scores the sixty answers on the server, exactly as the free tool does in
// the browser (index.html, calcScores). The browser sends raw answers, never
// scores, so a report always matches what was answered.
//
// If calcScores in index.html ever changes, change this file in the same
// commit. items.json is extracted from the free tool's QUESTIONS array.
// =====================================================================

import { readFileSync } from 'node:fs';

const ITEMS = JSON.parse(readFileSync(new URL('./items.json', import.meta.url), 'utf8'));

export const SCORING_VERSION = 'fff-1.0';
export const THRESHOLD = 60;

export const PROFILE_NAMES = {
  FFF: 'Complete Presenter',
  FFf: 'Solid Presenter',
  FfF: 'Compelling Presenter',
  Fff: 'Knowledgeable Presenter',
  fFF: 'Natural Presenter',
  fFf: 'Clear Presenter',
  ffF: 'Engaging Presenter',
  fff: 'Developing Presenter',
};

// answers: object keyed by item id (1 to 60), each an integer 1 to 5.
// Returns null if the answers are incomplete or out of range.
export function scoreAnswers(answers) {
  if (!answers || typeof answers !== 'object') return null;
  const dims = { fit: [], focus: [], 'flair-msg': [], 'flair-del': [] };
  const subs = {};
  for (const item of ITEMS) {
    const raw = Number(answers[item.id]);
    if (!Number.isInteger(raw) || raw < 1 || raw > 5) return null;
    const sc = item.rev ? 6 - raw : raw;
    dims[item.dim].push(sc);
    if (!subs[item.sub]) subs[item.sub] = { dim: item.dim, scores: [] };
    subs[item.sub].scores.push(sc);
  }
  const pct = arr => Math.round((arr.reduce((a, b) => a + (b - 1), 0) / (arr.length * 4)) * 100);
  const fitP = pct(dims.fit), focusP = pct(dims.focus);
  const fmP = pct(dims['flair-msg']), fdP = pct(dims['flair-del']);
  const flairP = Math.round((fmP + fdP) / 2);
  const key = (fitP >= THRESHOLD ? 'F' : 'f') + (focusP >= THRESHOLD ? 'F' : 'f') + (flairP >= THRESHOLD ? 'F' : 'f');

  const subscales = Object.entries(subs).map(([name, d]) => ({
    name, dim: d.dim, items: d.scores.length, pct: pct(d.scores),
    band: pct(d.scores) >= THRESHOLD ? 'strength' : 'opportunity',
  }));
  // Lowest first. Ties keep question order, exactly as the free results page
  // does, so the report names the same two priorities the reader has just seen.
  const ranked = [...subscales].sort((a, b) => a.pct - b.pct);
  const priorities = ranked.slice(0, 2).map(s => s.name);

  return {
    version: SCORING_VERSION,
    fitP, focusP, fmP, fdP, flairP, key,
    profileName: PROFILE_NAMES[key],
    subscales: ranked,
    priorities,
  };
}
