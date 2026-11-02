// =====================================================================
// lib/report.mjs  ·  fff-pro
//
// Lays out the FFF Pro report as an A4 PDF with pdfkit. Every word comes
// from content/advice.json (the advice bank Jim approves) or from the three
// personal paragraphs the model writes. Nothing here invents copy.
//
// renderReport({ name, scoring, content, personal, storyUrl, date }) -> Buffer
// =====================================================================

import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONTS = path.join(HERE, '..', 'fonts');

// The free tool's palette, so the report looks like the tool that sold it.
const C = {
  red: '#E8231A', navy: '#1A1A2E', ink: '#111111', muted: '#666666',
  line: '#DDDDDD', soft: '#F7F7F7', white: '#FFFFFF',
  fit: '#E8231A', focus: '#1A1A2E', 'flair-msg': '#B85C00', 'flair-del': '#006B5B',
};
const DIM_LABEL = { fit: 'Fit', focus: 'Focus', 'flair-msg': 'Flair: Message', 'flair-del': 'Flair: Delivery' };
const DIM_ORDER = ['fit', 'focus', 'flair-msg', 'flair-del'];

const PAGE_W = 595.28, PAGE_H = 841.89, M = 64, W = PAGE_W - 2 * M;
const BOTTOM = PAGE_H - 80;

function setupFonts(doc) {
  doc.registerFont('body', path.join(FONTS, 'Barlow-Regular.ttf'));
  doc.registerFont('medium', path.join(FONTS, 'Barlow-Medium.ttf'));
  doc.registerFont('semi', path.join(FONTS, 'Barlow-SemiBold.ttf'));
  doc.registerFont('bold', path.join(FONTS, 'Barlow-Bold.ttf'));
  doc.registerFont('italic', path.join(FONTS, 'Barlow-Italic.ttf'));
  doc.registerFont('display', path.join(FONTS, 'BarlowCondensed-Bold.ttf'));
}

// ---- text helpers -----------------------------------------------------
let BODY = 10.5;
function ensure(doc, h) { if (doc.y + h > BOTTOM) doc.addPage(); }
function eyebrow(doc, text, colour = C.red) {
  doc.font('semi').fontSize(9).fillColor(colour).text(text.toUpperCase(), M, doc.y, { characterSpacing: 1.5, width: W });
  doc.moveDown(0.3);
}
function title(doc, text, size = 30) {
  doc.font('display').fontSize(size).fillColor(C.navy).text(text.toUpperCase(), M, doc.y, { width: W, lineGap: -2 });
  doc.moveDown(0.25);
  doc.rect(M, doc.y, 56, 3).fill(C.red);
  doc.moveDown(1);
}
function h2(doc, text, colour = C.navy) {
  ensure(doc, 60);
  doc.moveDown(0.3);
  doc.font('bold').fontSize(12.5).fillColor(colour).text(text, M, doc.y, { width: W });
  doc.moveDown(0.3);
}
function para(doc, text, opts = {}) {
  ensure(doc, 40);
  doc.font(opts.font || 'body').fontSize(opts.size || BODY).fillColor(opts.colour || C.ink)
     .text(text, opts.x || M, doc.y, { width: opts.width || W, lineGap: 3 });
  doc.moveDown(0.55);
}
function labelled(doc, label, text) {
  if (!text) { h2(doc, label); return; }
  ensure(doc, 50);
  doc.font('bold').fontSize(11).fillColor(C.navy).text(label + '. ', M, doc.y, { continued: true, width: W, lineGap: 3.5 })
     .font('body').fillColor(C.ink).text(text);
  doc.moveDown(0.6);
}
function list(doc, items, numbered) {
  items.forEach((it, i) => {
    ensure(doc, 36);
    const y = doc.y;
    doc.font('semi').fontSize(BODY).fillColor(C.red).text(numbered ? `${i + 1}.` : '•', M, y, { width: 18 });
    doc.font('body').fontSize(BODY).fillColor(C.ink).text(it, M + 20, y, { width: W - 20, lineGap: 3 });
    doc.moveDown(0.4);
  });
  doc.moveDown(0.3);
}
function personal(doc, text) {
  // The model's paragraph sits in a quiet panel, so the reader sees it is theirs.
  doc.font('body').fontSize(BODY);
  const h = doc.heightOfString(text, { width: W - 32, lineGap: 3 }) + 40;
  ensure(doc, h + 10);
  const y = doc.y;
  doc.rect(M, y, W, h).fill(C.soft);
  doc.rect(M, y, 3, h).fill(C.red);
  doc.font('semi').fontSize(8.5).fillColor(C.red).text('WRITTEN FOR YOU', M + 16, y + 12, { characterSpacing: 1.2 });
  doc.font('body').fontSize(BODY).fillColor(C.ink).text(text, M + 16, y + 27, { width: W - 32, lineGap: 3 });
  doc.y = y + h + 14;
}
function blocks(doc, list_, fill) {
  for (const b of list_) {
    if (b.type === 'p') para(doc, fill(b.text));
    else if (b.type === 'labelled') labelled(doc, fill(b.label), fill(b.text));
    else if (b.type === 'bullets') list(doc, b.items.map(fill), false);
    else if (b.type === 'numbers') list(doc, b.items.map(fill), true);
  }
}

// ---- charts -------------------------------------------------------------
function bar(doc, x, y, w, pct, colour, h = 8) {
  doc.rect(x, y, w, h).fill('#EEEEEE');
  doc.rect(x, y, Math.max(2, w * pct / 100), h).fill(colour);
  // The 60 line: where a small f becomes a capital F.
  doc.save().lineWidth(1).strokeColor(C.navy).dash(2, { space: 2 })
     .moveTo(x + w * 0.6, y - 3).lineTo(x + w * 0.6, y + h + 3).stroke().restore();
}

function dimensionTiles(doc, s) {
  const vals = { fit: s.fitP, focus: s.focusP, 'flair-msg': s.fmP, 'flair-del': s.fdP };
  const gap = 10, tw = (W - 3 * gap) / 4, y = doc.y;
  DIM_ORDER.forEach((d, i) => {
    const x = M + i * (tw + gap);
    doc.rect(x, y, tw, 92).fill(C.soft);
    doc.rect(x, y, tw, 3).fill(C[d]);
    doc.font('semi').fontSize(8.5).fillColor(C[d]).text(DIM_LABEL[d].toUpperCase(), x + 10, y + 12, { width: tw - 20, characterSpacing: 1 });
    doc.font('display').fontSize(32).fillColor(C.navy).text(String(vals[d]), x + 10, y + 26, { width: tw - 20 });
    doc.font('body').fontSize(8.5).fillColor(C.muted).text('out of 100', x + 10, y + 62, { width: tw - 20 });
    bar(doc, x + 10, y + 78, tw - 20, vals[d], C[d], 5);
  });
  doc.y = y + 108;
}

function subscaleChart(doc, s, priorities) {
  // Every subscale, ranked from most to gain to strongest, coloured by dimension.
  const labelW = 230, barX = M + labelW + 10, barW = W - labelW - 50;
  for (const sub of s.subscales) {
    ensure(doc, 20);
    const y = doc.y, isP = priorities.includes(sub.name);
    doc.font(isP ? 'bold' : 'body').fontSize(9.5).fillColor(C.ink).text(sub.name, M, y, { width: labelW, lineBreak: false, ellipsis: true });
    bar(doc, barX, y + 2, barW, sub.pct, C[sub.dim], 7);
    doc.font(isP ? 'bold' : 'medium').fontSize(9.5).fillColor(C.navy).text(String(sub.pct), barX + barW + 8, y, { width: 30 });
    doc.y = y + 17;
  }
  doc.moveDown(0.4);
  doc.font('body').fontSize(8.5).fillColor(C.muted)
     .text('The dashed line marks 60. Bold rows are your two development priorities. Colours show the dimension: red Fit, navy Focus, amber Flair: Message, green Flair: Delivery.', M, doc.y, { width: W });
}

// ---- pages ----------------------------------------------------------------
function cover(doc, { name, s, date }) {
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(C.navy);
  doc.rect(0, 0, PAGE_W, 10).fill(C.red);
  doc.font('semi').fontSize(10).fillColor(C.red).text('FIT  ·  FOCUS  ·  FLAIR', M, 150, { characterSpacing: 3 });
  doc.font('display').fontSize(54).fillColor(C.white).text('FFF PRO\nREPORT', M, 172, { lineGap: -8 });
  doc.rect(M, doc.y + 12, 64, 4).fill(C.red);
  doc.font('semi').fontSize(10).fillColor(C.red).text('PREPARED FOR', M, 430, { characterSpacing: 2 });
  doc.font('medium').fontSize(24).fillColor(C.white).text(name, M, 448, { width: W });
  doc.font('body').fontSize(11).fillColor('#BBBBCC').text(date, M, 482);
  doc.font('body').fontSize(9).fillColor('#9999AA')
     .text('Jim Harvey  ·  The Message Business\nwww.themessagebusiness.com', M, PAGE_H - 110, { lineGap: 3 });
}

function onePage(doc, { s, content, priorities }) {
  eyebrow(doc, 'Your results on one page');
  title(doc, s.profileName);
  para(doc, `Your profile is ${s.key}: ${content.profiles[s.key].tag.toLowerCase()}. Your two development priorities are ${priorities[0]} and ${priorities[1]}.`, { font: 'medium' });
  dimensionTiles(doc, s);
  subscaleChart(doc, s, priorities);
}

function profilePage(doc, { s, content, personal: text }) {
  const p = content.profiles[s.key];
  eyebrow(doc, `Your profile  ·  ${s.key}`);
  title(doc, p.name);
  para(doc, p.tag, { font: 'italic', colour: C.muted });
  h2(doc, 'What your profile says');
  for (const x of p.says) x === '[[PERSONAL]]' ? personal(doc, text) : para(doc, x);
  h2(doc, 'Questions to reflect on');
  list(doc, p.questions, true);
  h2(doc, 'One thing to try');
  para(doc, p.tryThis, { font: 'medium' });
}

const STATUS = { 1: 'Your first focus', 2: 'Your second focus' };
function statusLabel(sub, priorityNo) {
  if (priorityNo) return STATUS[priorityNo];
  return sub.pct >= 60 ? 'A strength you can rely on, and still develop' : 'Next in line';
}
function notebook(doc, note, colour) {
  if (!note) return;
  doc.font('italic').fontSize(12);
  const qh = doc.heightOfString(`"${note.text}"`, { width: W - 24, lineGap: 3 });
  ensure(doc, qh + 34);
  const y = doc.y + 4;
  doc.rect(M, y, 3, qh + 20).fill(colour);
  doc.font('italic').fontSize(12).fillColor(C.navy).text(`"${note.text}"`, M + 16, y, { width: W - 24, lineGap: 3 });
  doc.font('semi').fontSize(8.5).fillColor(C.muted).text(`FROM JIM'S NOTEBOOK  ·  ${note.source.toUpperCase()}`, M + 16, doc.y + 4, { characterSpacing: 1 });
  doc.y = y + qh + 26;
}
function reading(doc, entry) {
  ensure(doc, 36);
  doc.font('semi').fontSize(9).fillColor(C.muted).text('GO DEEPER  ', M, doc.y, { continued: true, characterSpacing: 1 })
     .font('body').fillColor(C.ink).text(entry.deeper, { characterSpacing: 0 });
  if (entry.online) {
    doc.font('semi').fontSize(9).fillColor(C.muted).text('READ ONLINE  ', M, doc.y, { continued: true, characterSpacing: 1 })
       .font('body').fillColor(C.navy).text(entry.online.title, { characterSpacing: 0, link: entry.online.url, underline: true });
  }
}

function priorityHeight(doc, sub, entry, personalText, size) {
  const band = sub.pct >= 60 ? 'high' : 'low';
  const tx = (s, w = W) => { doc.font('body').fontSize(size); return doc.heightOfString(s, { width: w, lineGap: 3 }) + size * 0.55 * 1.2; };
  let h = 150;                                             // eyebrow, title, score block
  h += 4 * 26;                                             // four headings
  h += tx(entry.measures) + tx(entry.score[band]) + tx(entry.matters);
  if (personalText) h += tx(personalText, W - 32) + 54;
  if (entry.note) { doc.font('italic').fontSize(12); h += doc.heightOfString(`"${entry.note.text}"`, { width: W - 24, lineGap: 3 }) + 30; }
  for (const it of entry.practiseList[band]) h += tx(it, W - 20);
  return h + 40;                                           // reading lines
}

function subscalePage(doc, { sub, entry, rank, priorityNo, personalText }) {
  BODY = 10.5;
  while (BODY > 9.5 && M + priorityHeight(doc, sub, entry, personalText, BODY) > BOTTOM) BODY -= 0.25;
  const band = sub.pct >= 60 ? 'high' : 'low';
  const colour = C[sub.dim];
  eyebrow(doc, priorityNo ? `Development priority ${priorityNo}  ·  ${entry.dimLabel}` : `${entry.dimLabel}  ·  ranked ${rank} of 15`, colour);
  // Long subscale names drop a size so the title stays on one line.
  doc.font('display').fontSize(30);
  title(doc, sub.name, doc.widthOfString(sub.name.toUpperCase()) > W ? 24 : 30);
  doc.y -= 8;
  const y = doc.y;
  doc.font('display').fontSize(30).fillColor(colour).text(String(sub.pct), M, y - 4, { width: 60 });
  doc.font('body').fontSize(9).fillColor(C.muted).text('out of 100', M, y + 28, { width: 60 });
  bar(doc, M + 70, y + 12, W - 70, sub.pct, colour, 9);
  doc.font('semi').fontSize(9).fillColor(C.navy)
     .text(statusLabel(sub, priorityNo), M + 70, y + 30, { width: W - 70 });
  doc.y = y + 46;
  h2(doc, 'What this measures', colour); para(doc, entry.measures);
  h2(doc, 'What your score tells you', colour); para(doc, entry.score[band]);
  if (personalText) personal(doc, personalText);
  h2(doc, 'Why it matters in the room', colour); para(doc, entry.matters);
  notebook(doc, entry.note, colour);
  h2(doc, 'What to practise next', colour); list(doc, entry.practiseList[band], true);
  reading(doc, entry);
  BODY = 10.5;
}

// The other thirteen subscales flow on, as many to a page as fit, under the
// same four headers set as run-in labels. A block never splits across pages.
function compactParts(entry, sub) {
  const band = sub.pct >= 60 ? 'high' : 'low';
  return [
    ['What this measures', entry.measures],
    ['What your score tells you', entry.score[band]],
    ['Why it matters in the room', entry.matters],
  ];
}
function compactHeight(doc, sub, entry) {
  let h = 14;                                                             // eyebrow
  doc.font('display').fontSize(20); h += doc.heightOfString(sub.name.toUpperCase(), { width: W - 80 }) + 2;
  h += 26;                                                                // score line
  for (const [l, x] of compactParts(entry, sub)) { doc.font('body').fontSize(10); h += doc.heightOfString(`${l}. ${x}`, { width: W, lineGap: 2.5 }) + 4; }
  h += 15;                                                                // practise label
  for (const it of entry.practiseList[sub.pct >= 60 ? 'high' : 'low']) { doc.font('body').fontSize(10); h += doc.heightOfString(it, { width: W - 18, lineGap: 2.5 }) + 3; }
  return h + 36;                                                          // reading lines and gap
}
function compactSubscale(doc, { sub, entry, rank }) {
  const colour = C[sub.dim], band = sub.pct >= 60 ? 'high' : 'low';
  const need = compactHeight(doc, sub, entry) + (doc.y > 120 ? 20 : 0);
  if (doc.y + need > BOTTOM) doc.addPage();
  else if (doc.y > 120) {                                                 // a rule between blocks on the same page
    doc.moveTo(M, doc.y + 2).lineTo(M + W, doc.y + 2).lineWidth(0.5).strokeColor(C.line).stroke();
    doc.y += 18;
  }
  doc.font('semi').fontSize(8.5).fillColor(colour).text(`${entry.dimLabel}  ·  ranked ${rank} of 15`.toUpperCase(), M, doc.y, { characterSpacing: 1.4 });
  doc.moveDown(0.25);
  doc.font('display').fontSize(20).fillColor(C.navy).text(sub.name.toUpperCase(), M, doc.y, { width: W - 80 });
  const y = doc.y + 4;
  doc.font('display').fontSize(18).fillColor(colour).text(String(sub.pct), M, y - 2, { width: 34 });
  bar(doc, M + 40, y + 5, 200, sub.pct, colour, 6);
  doc.font('semi').fontSize(8.5).fillColor(C.navy).text(statusLabel(sub), M + 252, y + 3, { width: W - 252 });
  doc.y = y + 26;
  for (const [l, x] of compactParts(entry, sub)) {
    doc.font('bold').fontSize(10).fillColor(colour).text(l + '. ', M, doc.y, { continued: true, width: W, lineGap: 2.5 })
       .font('body').fillColor(C.ink).text(x);
    doc.moveDown(0.35);
  }
  doc.font('bold').fontSize(10).fillColor(colour).text('What to practise next', M, doc.y);
  doc.moveDown(0.2);
  entry.practiseList[band].forEach((it, i) => {
    const yy = doc.y;
    doc.font('semi').fontSize(10).fillColor(colour).text(`${i + 1}.`, M, yy, { width: 16 });
    doc.font('body').fontSize(10).fillColor(C.ink).text(it, M + 18, yy, { width: W - 18, lineGap: 2.5 });
    doc.moveDown(0.25);
  });
  doc.moveDown(0.3);
  reading(doc, entry);
  doc.moveDown(0.6);
}

function planPage(doc, { s, content, priorities }) {
  const [p1, p2] = priorities.map(n => s.subscales.find(x => x.name === n));
  const prac = sub => content.subscales[sub.name].practise[sub.pct >= 60 ? 'high' : 'low'];
  eyebrow(doc, 'Your 90-day plan');
  title(doc, 'Ninety days, two habits');
  const fill = t => t
    .replace('[Priority 1 name]', p1.name).replace('[Priority 2 name]', p2.name)
    .replace('[Priority 1 score]', String(p1.pct)).replace('[Priority 2 score]', String(p2.pct));
  for (const b of content.plan) {
    if (b.type === 'p' && /^\[What to practise next, from the Priority 1/i.test(b.text)) para(doc, prac(p1), { font: 'medium' });
    else if (b.type === 'p' && /^\[What to practise next, from the Priority 2/i.test(b.text)) para(doc, prac(p2), { font: 'medium' });
    else blocks(doc, [b], fill);
  }
}

function nextPage(doc, { s, content, priorities, storyUrl }) {
  eyebrow(doc, 'What next');
  title(doc, 'Where to go from here');
  const storyFirst = priorities.some(n => s.subscales.find(x => x.name === n).dim !== 'flair-del');
  for (const b of content.next) {
    if (b.type === 'labelled' && b.label === 'StoryMachine') {
      const full = b.text.replace(/^\[[^\]]*\]\s*/, '');
      const alt = content.next.find(x => x.type === 'p' && /^\[Shown when both/i.test(x.text));
      const text = storyFirst ? full : alt.text.replace(/^\[[^\]]*\]\s*/, '');
      labelled(doc, 'StoryMachine', text.replace('storymachine.themessagebusiness.com/fffpro', storyUrl));
      continue;
    }
    if (b.type === 'p' && /^\[Shown when both/i.test(b.text)) continue;
    if (b.type === 'p' && b.text === 'Jim Harvey') { para(doc, 'Jim Harvey', { font: 'semi' }); continue; }
    blocks(doc, [b], t => t);
  }
}

function stamp(doc, name) {
  const range = doc.bufferedPageRange();
  for (let i = range.start + 1; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const mb = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    doc.rect(0, 0, PAGE_W, 4).fill(C.red);
    doc.font('body').fontSize(8).fillColor(C.muted)
       .text(`${name}  ·  FFF Pro Report  ·  Private and confidential`, M, 30, { width: W, align: 'left', lineBreak: false });
    doc.text(`© Jim Harvey, The Message Business 2026`, M, PAGE_H - 40, { width: W / 2, lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, M + W / 2, PAGE_H - 40, { width: W / 2, align: 'right', lineBreak: false });
    doc.page.margins.bottom = mb;
  }
}

export function renderReport({ name, scoring: s, content, personal: P, storyUrl, date }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 64, bottom: 64, left: M, right: M }, bufferPages: true,
      info: { Title: `FFF Pro Report: ${name}`, Author: 'Jim Harvey, The Message Business', Subject: `${s.key} ${s.profileName}` } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    setupFonts(doc);

    const priorities = s.priorities;
    const firstName = name.split(/\s+/)[0];
    const fillPreface = t => t.replace('[Name]', firstName).replace('[code]', s.key).replace('[profile name]', s.profileName);

    cover(doc, { name, s, date });
    content.preface.forEach((pg, i) => {
      if (i % 2 === 0) { doc.addPage(); eyebrow(doc, 'Preface'); }
      else doc.moveDown(1.2);
      title(doc, pg.title); blocks(doc, pg.blocks, fillPreface);
    });
    doc.addPage(); onePage(doc, { s, content, priorities });
    doc.addPage(); profilePage(doc, { s, content, personal: P.profile });
    priorities.forEach((n, i) => {
      doc.addPage();
      subscalePage(doc, { sub: s.subscales.find(x => x.name === n), entry: content.subscales[n], priorityNo: i + 1, personalText: i === 0 ? P.priority1 : P.priority2 });
    });
    doc.addPage();
    eyebrow(doc, 'The other thirteen');
    title(doc, 'Your full results');
    para(doc, 'Every other habit the assessment measured, from the one with most to gain to your strongest. Read these in a second sitting.', { colour: C.muted });
    s.subscales.forEach((sub, i) => {
      if (priorities.includes(sub.name)) return;
      compactSubscale(doc, { sub, entry: content.subscales[sub.name], rank: i + 1 });
    });
    doc.addPage(); planPage(doc, { s, content, priorities });
    doc.addPage(); nextPage(doc, { s, content, priorities, storyUrl });
    stamp(doc, name);
    doc.end();
  });
}
