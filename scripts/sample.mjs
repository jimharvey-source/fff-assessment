// Renders one sample report per profile, with the fixed paragraphs, so the
// layout can be checked without Stripe, Supabase or the model.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { scoreAnswers } from '../lib/scoring.mjs';
import { renderReport } from '../lib/report.mjs';
import { writePersonal } from '../lib/narrative.mjs';
const content = JSON.parse(readFileSync(new URL('../content/advice.json', import.meta.url)));
const items = JSON.parse(readFileSync(new URL('../lib/items.json', import.meta.url)));
mkdirSync('samples', { recursive: true });
// Answers that land in each profile: high (4-5) or low (2-3) per dimension.
const hi = i => 4 + (i % 2), lo = i => 2 + (i % 2);
for (const code of ['FFF','FFf','FfF','Fff','fFF','fFf','ffF','fff']) {
  const want = { fit: code[0] === 'F', focus: code[1] === 'F', 'flair-msg': code[2] === 'F', 'flair-del': code[2] === 'F' };
  const answers = {}; items.forEach((it, i) => answers[it.id] = want[it.dim] ? hi(i) : lo(i));
  const s = scoreAnswers(answers);
  const personal = await writePersonal(s, 'Alex', { apiKey: process.env.ANTHROPIC_API_KEY });
  const pdf = await renderReport({ name: 'Alex Morgan', scoring: s, content, personal, storyUrl: 'storymachine.themessagebusiness.com/fffpro', date: '16 November 2026' });
  writeFileSync(`samples/fff-pro-${code}.pdf`, pdf);
  console.log(code, s.key, s.profileName, s.priorities.join(' | '), pdf.length, 'bytes');
}
