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
  'game-changer', 'delve', 'carefully crafted', 'judgment', 'utilize', 'utilise', 'color', 'behavior'];
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
  if (words < 60 || words > 140) v.push(`length ${words} words, aim for 80 to 120`);
  return v;
}

function brief(s) {
  const dims = `Fit ${s.fitP}, Focus ${s.focusP}, Flair: Message ${s.fmP}, Flair: Delivery ${s.fdP}`;
  const subs = s.subscales.map(x => `${x.name} (${x.dim}) ${x.pct}`).join('; ');
  return `Profile ${s.key}, ${s.profileName}. Dimension scores out of 100: ${dims}. A score of 60 or above is a strength. Subscales, lowest first: ${subs}. Development priorities: ${s.priorities.join(' and ')}.`;
}

const RULES = `Write one paragraph of 80 to 120 words in UK English, in the second person, addressed to the reader by first name once.
Rules you must follow:
- No contractions. No dashes of any kind. No exclamation marks. No questions.
- No antithesis: never write "not X but Y", "not X. It is Y", "rather than" or "instead of".
- Plain, specific words. Short sentences. No cliches, no business jargon.
- Frame low scores as the place with most to gain. Never call anything a weakness or a deficit.
- Use only the scores given. Never invent facts about the reader's job, industry or audience.
- Return the paragraph only, with no heading or quotation marks.`;

function prompts(s, firstName) {
  const [p1, p2] = s.priorities.map(n => s.subscales.find(x => x.name === n));
  const strongest = [...s.subscales].sort((a, b) => b.pct - a.pct)[0];
  return {
    profile: `You are Jim Harvey, a presentation coach with thirty years' experience, writing a short personal note inside a reader's FFF Pro report.\n${brief(s)}\nReader's first name: ${firstName}.\nTask: write the personal paragraph on the profile page. Say what this combination of scores means in practice for this reader. Name their strongest subscale (${strongest.name}, ${strongest.pct}) as something to build on, and connect it to their first priority.\n${RULES}`,
    priority1: `You are Jim Harvey, a presentation coach, writing inside a reader's FFF Pro report.\n${brief(s)}\nReader's first name: ${firstName}.\nTask: write the personal paragraph on the page for development priority 1, ${p1.name}, score ${p1.pct}. Explain why this is where practice will pay back fastest for someone with this profile, and which of their stronger subscales will help.\n${RULES}`,
    priority2: `You are Jim Harvey, a presentation coach, writing inside a reader's FFF Pro report.\n${brief(s)}\nReader's first name: ${firstName}.\nTask: write the personal paragraph on the page for development priority 2, ${p2.name}, score ${p2.pct}. Explain how it connects to priority 1 (${p1.name}) and why working on both together helps.\n${RULES}`,
  };
}

export function fallbacks(s, firstName) {
  const [p1, p2] = s.priorities.map(n => s.subscales.find(x => x.name === n));
  const strongest = [...s.subscales].sort((a, b) => b.pct - a.pct)[0];
  return {
    profile: `${firstName}, your scores put you in the ${s.profileName} profile. Your strongest subscale is ${strongest.name}, at ${strongest.pct}. That is a habit you already rely on, and it gives you a base to build from. Your first development priority is ${p1.name}, at ${p1.pct}. This is where a small, deliberate change in how you prepare will show quickest in the room. Read the two priority pages next, then choose one real presentation in the coming fortnight to try the first practice step. Notice what changes for you and for your audience.`,
    priority1: `${firstName}, ${p1.name} scored ${p1.pct}, the place in your results with most to gain. Your strength in ${strongest.name}, at ${strongest.pct}, will help here, because the habits behind it are already part of how you work. The practice step on this page is small on purpose. Use it in your next two presentations, however routine they are. After each one, write one line on what difference it made. Those notes will show you, faster than any score, that the habit is taking hold.`,
    priority2: `${firstName}, ${p2.name} scored ${p2.pct} and is your second priority. It works alongside ${p1.name}: as the first habit settles, this one adds to it, and each makes the other easier. Leave this page for the second month of your plan, once the first practice step feels natural. Then add this one to at least two more presentations. Ask a colleague to watch one of them and tell you what they noticed. Their answer will tell you more than your own impression.`,
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
