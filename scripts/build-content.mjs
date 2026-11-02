// =====================================================================
// scripts/build-content.mjs  ·  fff-pro
//
// Turns the advice bank (exported from the Claude Doc as markdown) into
// content/advice.json, which the report generator reads. Jim edits the doc;
// this script is rerun before each deploy. It fails loudly if any profile or
// subscale is missing a section, so a gap never reaches a paying reader.
//
//   node scripts/build-content.mjs content/advice-bank.md content/advice.json
// =====================================================================

import { readFileSync, writeFileSync } from 'node:fs';

const [src = 'content/advice-bank.md', out = 'content/advice.json'] = process.argv.slice(2);

const clean = s => s
  .replace(/\*\*\*\*/g, '')              // bold runs split by editing
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/\\\[/g, '[').replace(/\\\]/g, ']')
  .replace(/\\([*_])/g, '$1')
  .replace(/ /g, ' ')
  .trim();

const md = clean(readFileSync(src, 'utf8'));

// Split into sections by heading level.
function sections(text, level) {
  const re = new RegExp(`^${'#'.repeat(level)} (.+)$`, 'gm');
  const out = []; let m; const marks = [];
  while ((m = re.exec(text))) marks.push({ title: m[1].trim(), start: m.index, bodyStart: re.lastIndex });
  marks.forEach((mk, i) => out.push({ title: mk.title, body: text.slice(mk.bodyStart, i + 1 < marks.length ? marks[i + 1].start : text.length).trim() }));
  return out;
}

const paras = body => body.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
const strip = s => s.replace(/\*\*/g, '').replace(/(^|\s)\*(\S[^*]*\S|\S)\*/g, '$1$2').trim();

// "**Label.** text" -> { label, text }
function labelled(p) {
  const m = p.match(/^\*\*([^*]+?)\*\*\s*(.*)$/s);
  return m ? { label: m[1].replace(/\.$/, '').trim(), text: m[2].trim() } : null;
}

// Blocks for free-form pages: paragraphs, bullet lists, numbered lists.
function blocks(body) {
  return paras(body).map(p => {
    const lines = p.split('\n');
    if (lines.every(l => /^[-*] /.test(l))) return { type: 'bullets', items: lines.map(l => strip(l.slice(2))) };
    if (lines.every(l => /^\d+\. /.test(l))) return { type: 'numbers', items: lines.map(l => strip(l.replace(/^\d+\. /, ''))) };
    const lab = labelled(p);
    if (lab) return { type: 'labelled', label: lab.label, text: strip(lab.text) };
    return { type: 'p', text: strip(p.replace(/\n/g, ' ')) };
  });
}

const errors = [];
const top = sections(md, 2);
const find = name => top.filter(s => s.title.toLowerCase().startsWith(name.toLowerCase()));

// ---- preface ---------------------------------------------------------
const preface = sections(find('Preface')[0].body, 3).map(s => ({
  title: s.title.replace(/^Page \d+\.\s*/, ''),
  blocks: blocks(s.body),
}));
if (preface.length !== 4) errors.push(`preface has ${preface.length} pages, expected 4`);

// ---- profiles --------------------------------------------------------
const profiles = {};
for (const part of find('Profile pages')) {
  for (const s of sections(part.body, 3)) {
    const m = s.title.match(/^([Ff]{3})\.\s*(.+)$/);
    if (!m) continue;
    const [, code, name] = m;
    const ps = paras(s.body);
    const tag = strip(ps[0]);
    let says = [], questions = [], tryThis = '', mode = 'says';
    for (const p of ps.slice(1)) {
      const lab = labelled(p);
      if (lab && /^what your profile says/i.test(lab.label)) { says.push(strip(lab.text)); continue; }
      if (lab && /^questions to/i.test(lab.label)) { mode = 'q'; continue; }
      if (lab && /^one thing to try/i.test(lab.label)) { tryThis = strip(lab.text); continue; }
      if (/^\[personal paragraph/i.test(p)) { says.push('[[PERSONAL]]'); continue; }
      if (mode === 'q' && /^\d+\. /m.test(p)) { questions = p.split('\n').map(l => strip(l.replace(/^\d+\. /, ''))); mode = 'says'; continue; }
      says.push(strip(p));
    }
    if (!says.includes('[[PERSONAL]]')) says.push('[[PERSONAL]]');
    if (questions.length !== 4) errors.push(`${code}: ${questions.length} questions`);
    if (!tryThis) errors.push(`${code}: no one thing to try`);
    profiles[code] = { code, name, tag, says, questions, tryThis };
  }
}
for (const c of ['FFF', 'FFf', 'FfF', 'Fff', 'fFF', 'fFf', 'ffF', 'fff']) if (!profiles[c]) errors.push(`profile ${c} missing`);

// ---- subscales -------------------------------------------------------
const DIMS = { 'Fit': 'fit', 'Focus': 'focus', 'Flair: Message': 'flair-msg', 'Flair: Delivery': 'flair-del' };
const subscales = {};
for (const s of sections(find('Subscale pages')[0].body, 3)) {
  const m = s.title.match(/^(Fit|Focus|Flair: Message|Flair: Delivery) (\d+)\.\s*(.+)$/);
  if (!m) { errors.push(`unreadable subscale heading: ${s.title}`); continue; }
  const [, dimLabel, n, name] = m;
  const entry = { name, dim: DIMS[dimLabel], dimLabel, order: Number(n) };
  const ps = paras(s.body);
  for (let i = 0; i < ps.length; i++) {
    const lab = labelled(ps[i]);
    if (!lab) continue;
    const key = lab.label.toLowerCase();
    const banded = () => {
      const list = (ps[i + 1] || '').split('\n').map(l => l.replace(/^[-*] /, ''));
      const get = re => { const l = list.find(x => re.test(x)); return l ? strip(l.replace(/^\*[^*]+\*\s*/, '')) : ''; };
      return { high: get(/^\*60 and above/i), low: get(/^\*Below 60/i) };
    };
    if (key.startsWith('what this measures')) entry.measures = strip(lab.text);
    else if (key.startsWith('what your score tells you')) entry.score = banded();
    else if (key.startsWith('why it matters')) entry.matters = strip(lab.text);
    else if (key.startsWith('what to practise next')) {
      // Two numbered lists, one per band, each headed by its band in italics.
      const lists = { high: [], low: [] };
      let band = null;
      for (let j = i + 1; j < ps.length && !labelled(ps[j]); j++) {
        if (/^\*60 and above/i.test(ps[j])) band = 'high';
        else if (/^\*Below 60/i.test(ps[j])) band = 'low';
        else if (band && /^\d+\. /.test(ps[j])) lists[band] = ps[j].split('\n').map(l => strip(l.replace(/^\d+\. /, '')));
      }
      entry.practiseList = lists;
      entry.practise = { high: lists.high[0], low: lists.low[0] };   // the headline step, used by the 90-day plan
    }
    else if (key.startsWith("from jim's notebook")) {
      const nm = lab.text.match(/^"(.+)"\s*\(([^)]+)\)\s*$/s);
      if (nm) entry.note = { text: strip(nm[1]), source: nm[2].trim() };
    }
    else if (key.startsWith('go deeper')) entry.deeper = strip(lab.text);
    else if (key.startsWith('read online')) {
      const lm = lab.text.match(/\[([^\]]+)\]\((https?:[^)]+)\)/);
      if (lm) entry.online = { title: lm[1], url: lm[2] };
    }
  }
  for (const f of ['measures', 'matters', 'deeper']) if (!entry[f]) errors.push(`${name}: no ${f}`);
  for (const f of ['score', 'practise']) if (!entry[f]?.high || !entry[f]?.low) errors.push(`${name}: ${f} missing a band`);
  for (const band of ['high', 'low']) if ((entry.practiseList?.[band] || []).length < 3) errors.push(`${name}: fewer than three ways to practise (${band})`);
  if (!entry.note) errors.push(`${name}: no notebook line`);
  subscales[name] = entry;
}
if (Object.keys(subscales).length !== 15) errors.push(`${Object.keys(subscales).length} subscales, expected 15`);

// ---- 90-day plan and what next ----------------------------------------
const planBlocks = blocks(find('Your 90-day plan')[0].body).slice(1);   // drop the editor's note
const nextBlocks = blocks(find('What next')[0].body).slice(1);

const content = { builtAt: new Date().toISOString(), preface, profiles, subscales, plan: planBlocks, next: nextBlocks };

// The report's voice rules, checked on every line Jim approved.
const all = JSON.stringify(content);
if (/[—–]/.test(all)) errors.push('an em or en dash is in the content');
const con = all.match(/\b(you're|you've|you'll|you'd|it's|that's|there's|here's|what's|don't|doesn't|didn't|isn't|aren't|won't|can't|couldn't|wouldn't|shouldn't)\b/i);
if (con) errors.push(`a contraction is in the content: ${con[0]}`);

if (errors.length) {
  console.error('Content build failed:\n- ' + errors.join('\n- '));
  process.exit(1);
}
writeFileSync(out, JSON.stringify(content, null, 2));
console.log(`OK: ${preface.length} preface pages, ${Object.keys(profiles).length} profiles, ${Object.keys(subscales).length} subscales -> ${out}`);
