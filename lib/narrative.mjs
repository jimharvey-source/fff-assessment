import { you, youLower } from './names.mjs';
// =====================================================================
// lib/narrative.mjs  ·  fff-pro
//
// Writes the three personal paragraphs: one for the profile page, one for
// each development priority. Rules from the advice bank: 80 to 120 words,
// UK English, second person, no contractions, dashes, antithesis, questions
// or exclamation marks; never invent facts about the reader's job.
//
// Each paragraph gets one corrective retry. If it still breaks a rule, the
// report uses a fixed paragraph. A paying reader always gets a report.
// =====================================================================

const BANNED = ['not just', 'not only', 'rather than', 'instead of', 'journey', 'leverage', 'unlock',
  'game-changer', 'delve', 'carefully crafted', 'judgment', 'utilize', 'utilise', 'color', 'behavior',
  'genuine', 'genuinely', 'real opportunity', 'opportunity lies', 'solid foundation', 'foundation',
  'dual focus', 'coherent', 'development path', 'momentum', 'empower', 'holistic', 'robust',
  'seamless', 'synergy', 'key to success', 'take it to the next level', 'elevate', 'transform'];
const CONTRACTIONS = /\b(you're|you've|you'll|you'd|it's|that's|there's|here's|what's|who's|they're|we're|i'm|don't|doesn't|didn't|isn't|aren't|wasn't|weren't|won't|can't|couldn't|wouldn't|shouldn't|hasn't|haven't|hadn't|let's)\b/i;
// "not X but Y", "not X. It is Y": the antithesis shapes Jim bans.
const ANTITHESIS = /\bnot\b[^.]{0,60}\bbut\b|\bis not\b[^.]{0,60}\.\s+(it|this) is\b/i;

export function violations(text) {
  const v = [];
  if (/[—–]/.test(text) || /\s-\s/.test(text)) v.push('no dashes');
  const c = text.match(CONTRACTIONS); if (c) v.push(`no contractions ("${c[0]}")`);
  if (ANTITHESIS.test(text)) v.push('no antithesis ("not ... but")');
  for (const b of BANNED) if (new RegExp('\\b' + b + '\\b', 'i').test(text)) v.push(`banned word ("${b}")`);
  if (/[!?]/.test(text)) v.push('no questions or exclamation marks');
  const words = text.trim().split(/\s+/).length;
  if (words < 50 || words > 110) v.push(`length ${words} words, aim for 60 to 90`);
  return v;
}

function brief(s) {
  const dims = `Fit ${s.fitP}, Focus ${s.focusP}, Flair: Message ${s.fmP}, Flair: Delivery ${s.fdP}`;
  const subs = s.subscales.map(x => `${you(x.name)} (${x.dim}) ${x.pct}`).join('; ');
  return `Profile ${s.key}, ${s.profileName}. Dimension scores out of 100: ${dims}. A score of 60 or above is a strength. Subscales, lowest first: ${subs}. Development priorities: ${s.priorities.map(you).join(' and ')}.`;
}

const RULES = `Write one paragraph of 60 to 90 words in UK English, in the second person, addressed to the reader by first name once.
Rules you must follow:
- No contractions. No dashes of any kind. No exclamation marks. No questions.
- No antithesis: never write "not X but Y", "not X. It is Y", "rather than" or "instead of".
- Always address the reader as you and your. Never call the reader a presenter, a speaker or they.
- Write the habit names exactly as given, in lower case after the first word, for example "understanding your subject".
- Plain, specific words. Short sentences. No cliches, no business jargon, no consultant phrases.
- Never use these words: genuine, foundation, momentum, journey, coherent, opportunity lies, dual focus, development path.
- Write like an experienced coach talking to one person after a session: direct, warm, concrete.
- Describe one moment in a presentation where this score shows, such as the first minute, a hard question or the close.
- End with one specific thing to do in the reader's next presentation.
- Frame low scores as the place with most to gain. Never call anything a weakness or a deficit.
- Use only the scores given. Never invent facts about the reader's job, industry or audience.
- Return the paragraph only, with no heading or quotation marks.`;

function prompts(s, firstName) {
  const [p1, p2] = s.priorities.map(n => s.subscales.find(x => x.name === n));
  const strongest = [...s.subscales].sort((a, b) => b.pct - a.pct)[0];
  return {
    profile: `You are Jim Harvey, a presentation coach with thirty years' experience, writing a short personal note inside a reader's FFF Pro report.\n${brief(s)}\nReader's first name: ${firstName}.\nTask: write the personal paragraph on the profile page. Say what this combination of scores means in practice for this reader. Name their strongest subscale (${you(strongest.name)}, ${strongest.pct}) as something to build on, and connect it to their first priority.\n${RULES}`,
    priority1: `You are Jim Harvey, a presentation coach, writing inside a reader's FFF Pro report.\n${brief(s)}\nReader's first name: ${firstName}.\nTask: write the personal paragraph on the page for development priority 1, ${you(p1.name)}, score ${p1.pct}. Explain why this is where practice will pay back fastest for someone with this profile, and which of their stronger subscales will help.\n${RULES}`,
    priority2: `You are Jim Harvey, a presentation coach, writing inside a reader's FFF Pro report.\n${brief(s)}\nReader's first name: ${firstName}.\nTask: write the personal paragraph on the page for development priority 2, ${you(p2.name)}, score ${p2.pct}. Explain how it connects to priority 1 (${you(p1.name)}) and why working on both together helps.\n${RULES}`,
  };
}

export function fallbacks(s, firstName) {
  const [p1, p2] = s.priorities.map(n => s.subscales.find(x => x.name === n));
  const strongest = [...s.subscales].sort((a, b) => b.pct - a.pct)[0];
  return {
    profile: `${firstName}, your scores put you in the ${s.profileName} profile. Your strongest habit is ${youLower(strongest.name)}, at ${strongest.pct}. You already rely on it, so build from there. Your first priority is ${youLower(p1.name)}, at ${p1.pct}. A small change in how you prepare will show here first. Read the two priority pages next, then pick one real presentation in the coming fortnight and try the first step.`,
    priority1: `${firstName}, ${youLower(p1.name)} scored ${p1.pct}, your first focus. Your strength in ${youLower(strongest.name)}, at ${strongest.pct}, will help, because those habits are already part of how you work. Use the first step on this page in your next two presentations, however routine. After each one, write one line on what changed. Those notes will tell you faster than any score that the habit is taking hold.`,
    priority2: `${firstName}, ${youLower(p2.name)} scored ${p2.pct} and is your second focus. It builds on ${youLower(p1.name)}: as the first habit settles, this one becomes easier. Start it in the second month of your plan. Use it in at least two presentations, and ask a colleague to watch one and tell you what they noticed. Their answer will tell you more than your own impression.`,
  };
}

async function callModel(apiKey, model, prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    // No extended thinking on these short paragraphs; 600 tokens of headroom.
    body: JSON.stringify({ model, max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) {
    console.error('[narrative] Anthropic non-OK', res.status, (await res.text()).slice(0, 300));
    return null;
  }
  const data = await res.json();
  return (data.content?.[0]?.text || '').trim().replace(/^["']|["']$/g, '');
}

export async function writePersonal(s, firstName, { apiKey, model = 'claude-haiku-4-5' } = {}) {
  const fixed = fallbacks(s, firstName);
  if (!apiKey) return { ...fixed, source: 'fallback' };
  const ps = prompts(s, firstName);
  const out = { source: 'model' };
  await Promise.all(Object.keys(ps).map(async key => {
    let text = await callModel(apiKey, model, ps[key]);
    let v = text ? violations(text) : ['no response'];
    if (text && v.length) {
      const retry = await callModel(apiKey, model, `${ps[key]}\n\nYour last draft broke these rules: ${v.join('; ')}. It was rejected. Here it is:\n${text}\nWrite it again, keeping to every rule.`);
      if (retry) { text = retry; v = violations(text); }
    }
    if (!text || v.length) {
      console.error('[narrative] Using fixed paragraph for', key, '-', v.join('; '));
      out[key] = fixed[key]; out.source = 'mixed';
    } else out[key] = text;
  }));
  return out;
}
