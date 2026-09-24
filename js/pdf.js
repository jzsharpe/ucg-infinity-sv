// Draws the UCG Infinity Start Value Worksheet (one landscape page per event,
// same layout as the original WAG Open worksheet plus the UCG event bonus) and
// a vault / all-around summary page. Each event page lists the 8 counting
// skills, plus any non-counting skill that earns element group credit;
// repeated and other non-counting skills are left off.
import { PDFDocument, StandardFonts, rgb } from 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js';
import { APPARATUS, EVENTS, EVENT_BONUS, MAX_SKILLS, MIN_SKILLS, scoreAthlete, fmt } from './scoring.js';

// UCG logo (wide lockup). If it's missing, a simple "UCG" mark is drawn instead.
const LOGO_URL = 'assets/logo.png';

const W = 792;
const H = 612;
// UCG palette: navy #1E2B38, light blue #DBEBEE, dark blue green #184B56.
const NAVY = rgb(0.118, 0.169, 0.22);
const INK = NAVY;
const HEAD = NAVY;
const WHITE = rgb(1, 1, 1);
const LINE = rgb(0.647, 0.784, 0.812); // blue green #A5C8CF (prints more clearly than the UI border tint)
const MUTED = rgb(0.29, 0.353, 0.4); // fg-secondary #4A5A66
const HIGHLIGHT = rgb(0.859, 0.922, 0.933); // light blue #DBEBEE
const SUBHEAD = rgb(0.78, 0.871, 0.886); // light blue deep #C7DEE2
const GOOD = rgb(0.094, 0.294, 0.337); // dark blue green #184B56

// Standard PDF fonts only cover WinAnsi; swap anything else for a close match.
function safeText(font, text) {
  const s = String(text ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-');
  return [...s]
    .map((ch) => {
      try {
        font.encodeText(ch);
        return ch;
      } catch {
        return '?';
      }
    })
    .join('');
}

function painter(page, fonts) {
  const p = {
    text(s, x, y, { size = 10, font = fonts.regular, color = INK, maxWidth } = {}) {
      let t = safeText(font, s);
      if (maxWidth) {
        // Shrink long text to fit its box (down to 6pt), then truncate.
        while (size > 6 && font.widthOfTextAtSize(t, size) > maxWidth) size -= 0.5;
        while (t.length > 1 && font.widthOfTextAtSize(t, size) > maxWidth) t = t.slice(0, -1);
      }
      page.drawText(t, { x, y, size, font, color });
    },
    center(s, cx, y, opts = {}) {
      const font = opts.font || fonts.regular;
      const size = opts.size || 10;
      const t = safeText(font, s);
      p.text(t, cx - font.widthOfTextAtSize(t, size) / 2, y, opts);
    },
    // Wrapped text; returns the y of the next line.
    wrap(s, x, y, width, { size = 7.5, font = fonts.regular, lead = size * 1.25, color = INK } = {}) {
      const words = safeText(font, s).split(/\s+/);
      let line = '';
      for (const w of words) {
        const next = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(next, size) > width && line) {
          page.drawText(line, { x, y, size, font, color });
          y -= lead;
          line = w;
        } else line = next;
      }
      if (line) page.drawText(line, { x, y, size, font, color });
      return y - lead;
    },
    box(x, y, w, h, { fill, border = LINE, thickness = 0.75 } = {}) {
      page.drawRectangle({ x, y, width: w, height: h, color: fill, borderColor: border, borderWidth: thickness });
    },
    line(x1, y1, x2, y2, thickness = 0.75, color = LINE) {
      page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color });
    },
  };
  return p;
}

async function loadLogo(doc) {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    return await doc.embedPng(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// Logo on the left, title centred in the space to its right.
function drawHeader(page, p, fonts, logo, title) {
  const x = 110;
  const top = 568;
  const h = 38;
  let right = x;
  if (logo) {
    const w = (logo.width / logo.height) * h;
    page.drawImage(logo, { x, y: top - h, width: w, height: h });
    right = x + w;
  } else {
    page.drawCircle({ x: x + 19, y: top - 19, size: 19, color: NAVY });
    p.center('UCG', x + 19, top - 23.5, { size: 12, font: fonts.bold, color: WHITE });
    right = x + 38;
  }
  p.center(title, (right + 16 + 700) / 2, top - 26, { size: 18, font: fonts.bold, color: NAVY });
}

function drawEventPage(doc, fonts, logo, athlete, event, r) {
  const page = doc.addPage([W, H]);
  const p = painter(page, fonts);
  const ap = APPARATUS[event];

  // ---- Title & header line
  drawHeader(page, p, fonts, logo, 'UCG Infinity Start Value Worksheet');

  const hy = 488;
  p.text('Gymnast Name:', 110, hy, { size: 10 });
  p.line(185, hy - 2, 398, hy - 2, 0.5);
  p.text(athlete.name, 189, hy + 1, { size: 11, font: fonts.bold, maxWidth: 205 });
  p.text('Gymnast Club:', 408, hy, { size: 10 });
  p.line(476, hy - 2, 600, hy - 2, 0.5);
  p.text(athlete.club, 480, hy + 1, { size: 11, font: fonts.bold, maxWidth: 118 });
  p.text('Apparatus:', 610, hy, { size: 10 });
  p.line(662, hy - 2, 700, hy - 2, 0.5);
  p.text(ap.short, 665, hy + 1, { size: 11, font: fonts.bold, maxWidth: 34 });

  // ---- Skills table
  const cols = [
    { x: 110, w: 18, head: ['#'] },
    { x: 128, w: 170, head: ['Name of Skill'] },
    { x: 298, w: 40, head: ['Difficulty', '(A/B/etc.)'] },
    { x: 338, w: 64, head: ['Value', '(A=0.1, B=0.3,', 'C=0.5, etc.)'] },
    { x: 402, w: 58, head: ['Condensed', 'Element', 'Group (I-IV)'] },
    { x: 460, w: 72, head: ['EG Bonus (one per', 'Condensed Group,', 'max +1.2)'] },
  ];
  const tableTop = 468;
  const headH = 36;
  const baseRowH = 20;
  // Non-counting skills that earn element group credit (no difficulty) go in
  // extra rows under skill 8. The table grows into the gap above the totals and
  // the rows shrink to fit, so the rest of the page stays put.
  const extras = r.extraRows;
  const rowsArea = MAX_SKILLS * baseRowH + (extras.length ? 20 : 0);
  const rowH = rowsArea / (MAX_SKILLS + extras.length);
  const fs = rowH < 18 ? 9 : 10;
  p.box(110, tableTop - headH, 422, headH, { fill: HEAD, border: HEAD });
  for (const c of cols) {
    const n = c.head.length;
    c.head.forEach((h, i) =>
      p.center(h, c.x + c.w / 2, tableTop - headH / 2 + (n - 1) * 4.5 - i * 9 - 3, { size: 7, font: fonts.bold, color: WHITE })
    );
  }
  for (let i = 0; i < MAX_SKILLS + extras.length; i++) {
    const y = tableTop - headH - (i + 1) * rowH;
    const extra = i >= MAX_SKILLS;
    const row = extra ? extras[i - MAX_SKILLS] : r.rows[i];
    for (const c of cols) p.box(c.x, y, c.w, rowH, { fill: extra ? HIGHLIGHT : undefined });
    const ty = y + rowH / 2 - 3.5;
    p.center(extra ? 'EG' : String(i + 1), 119, ty, { size: extra ? 6.5 : 8, font: extra ? fonts.bold : fonts.regular });
    if (!row) continue;
    p.text(row.name, 132, ty, { size: fs - 0.5, maxWidth: 162 });
    p.center(row.letter, 318, ty, { size: fs });
    if (extra) p.center('EG bonus only', 370, ty + 0.5, { size: 6.5, color: MUTED });
    else if (row.letter) p.center(fmt(row.value), 370, ty, { size: fs });
    if (row.condensed) p.center(`${row.condensed} (${row.eg})`, 431, ty, { size: fs });
    else if (row.eg) p.center(String(row.eg), 431, ty, { size: fs });
    if (row.bonus) p.center(`+${fmt(row.bonus)}`, 496, ty, { size: fs, font: fonts.bold, color: GOOD });
  }
  const tableBottom = tableTop - headH - rowsArea;
  const totalsTop = tableTop - headH - MAX_SKILLS * baseRowH - 28; // fixed, whatever the row count

  // ---- Event bonus box (right of the table)
  const ebx = 548;
  const ebw = 152;
  p.box(ebx, tableTop - headH, ebw, headH, { fill: HEAD, border: HEAD });
  p.center(`${ap.short} Event Bonus`, ebx + ebw / 2, tableTop - 15, { size: 9, font: fonts.bold, color: WHITE });
  p.center(`(+${fmt(EVENT_BONUS)})`, ebx + ebw / 2, tableTop - 27, { size: 8, font: fonts.bold, color: WHITE });
  const ebBodyTop = tableTop - headH;
  p.box(ebx, tableBottom, ebw, ebBodyTop - tableBottom);
  let y = p.wrap(ap.eventBonus, ebx + 10, ebBodyTop - 18, ebw - 20, { size: 10, font: fonts.bold });
  y -= 14;
  p.box(ebx + 10, y - 3, 14, 14, { thickness: 1, border: INK });
  if (r.eventBonus) {
    page.drawLine({ start: { x: ebx + 13, y: y + 4 }, end: { x: ebx + 16.5, y }, thickness: 2, color: GOOD });
    page.drawLine({ start: { x: ebx + 16.5, y }, end: { x: ebx + 22, y: y + 9 }, thickness: 2, color: GOOD });
  }
  p.text('Performed', ebx + 30, y, { size: 10 });
  p.center(r.eventBonus ? `+${fmt(r.eventBonus)}` : '0.0', ebx + ebw / 2, tableBottom + 18, {
    size: 22,
    font: fonts.bold,
    color: r.eventBonus ? GOOD : MUTED,
  });

  // ---- Totals row
  const totals = [
    ['Execution', '10.0'],
    ['Total Difficulty', fmt(r.difficulty)],
    ['Total EG', fmt(r.egTotal)],
    ['Event Bonus', fmt(r.eventBonus)],
    [`Skills short of ${MIN_SKILLS}`, fmt(r.shortBy)],
    ['Start Value', r.startValue.toFixed(2)],
  ];
  const ops = ['+', '+', '+', '-', '='];
  const bw = 82;
  const gap = 19.6;
  const tTop = totalsTop;
  const tHead = 14;
  const tBody = 36;
  totals.forEach(([label, val], i) => {
    const x = 110 + i * (bw + gap);
    const last = i === totals.length - 1;
    p.box(x, tTop - tHead, bw, tHead, { fill: HEAD, border: HEAD });
    p.center(label, x + bw / 2, tTop - tHead + 4, { size: 7.5, font: fonts.bold, color: WHITE });
    p.box(x, tTop - tHead - tBody, bw, tBody, { thickness: last ? 1.5 : 0.75, border: last ? INK : LINE });
    p.center(val, x + bw / 2, tTop - tHead - tBody + 11, { size: last ? 22 : 18, font: last || i === 0 ? fonts.bold : fonts.regular });
    if (i < ops.length) p.center(ops[i], x + bw + gap / 2, tTop - tHead - tBody / 2 - 2, { size: 16, font: fonts.bold });
  });

  // ---- Notes (bottom left)
  const notesTop = tTop - tHead - tBody - 14;
  const notes = [
    ['Difficulty Notes:', 'A=0.1, B=0.3, C=0.5, etc. Only the top 8 most valuable skills count towards difficulty, so only list the 8 most difficult.'],
    ['Element Group Bonus:', 'For each Condensed Element Group (below) in which you do a B or higher skill, you get +0.3. One bonus per group, max +1.2.'],
    [`Event Bonus:`, `+${fmt(EVENT_BONUS)} when the event-specific requirement is performed. Bars: min. 2 bar changes. Beam: acro series with 2 connected flight elements. Floor: acro pass with min. 2 connected saltos (direct or indirect).`],
    ['Short routine deduction:', `For each skill fewer than ${MIN_SKILLS} in the routine, the gymnast loses 1 point (a 4 skill routine gets -2.0).`],
  ];
  const nx = 110;
  const nw = 222;
  const nGap = 4;
  const nh = (notesTop - 22 - nGap * (notes.length - 1)) / notes.length;
  notes.forEach(([title, body], i) => {
    const top = notesTop - i * (nh + nGap);
    p.box(nx, top - nh, nw, nh);
    const f = fonts.bold;
    const size = 6.8;
    page.drawText(safeText(f, title), { x: nx + 4, y: top - 9, size, font: f });
    const tw = f.widthOfTextAtSize(title, size);
    page.drawLine({ start: { x: nx + 4, y: top - 10.2 }, end: { x: nx + 4 + tw, y: top - 10.2 }, thickness: 0.4, color: INK });
    p.wrap(body, nx + 4, top - 18, nw - 8, { size: 6.5, lead: 7.6 });
  });

  // ---- Element groups table (bottom right)
  const gx = 346;
  const gw = 354;
  const gTop = notesTop;
  const gBottom = 22;
  const titleH = 13;
  const subH = 12;
  const romanW = 20;
  const colW = (gw - romanW) / 3;
  p.box(gx, gTop - titleH, gw, titleH, { fill: HEAD, border: HEAD });
  p.center('Element Groups for Each Apparatus', gx + gw / 2, gTop - titleH + 3.5, { size: 7.5, font: fonts.bold, color: WHITE });
  const subTop = gTop - titleH;
  EVENTS.forEach((e, i) => {
    const x = gx + romanW + i * colW;
    p.box(x, subTop - subH, colW, subH, { fill: e === event ? HIGHLIGHT : SUBHEAD });
    p.center(APPARATUS[e].short, x + colW / 2, subTop - subH + 3.5, { size: 7.5, font: fonts.bold });
  });
  p.box(gx, subTop - subH, romanW, subH, { fill: SUBHEAD });

  const romans = ['I', 'II', 'III', 'IV'];
  const lines = romans.map((cg) => Math.max(...EVENTS.map((e) => APPARATUS[e].condensed[cg].length)));
  const bodyTop = subTop - subH;
  const lineH = (bodyTop - gBottom) / lines.reduce((a, b) => a + b, 0);
  let rowTop = bodyTop;
  romans.forEach((cg, ri) => {
    const h = lines[ri] * lineH;
    p.box(gx, rowTop - h, romanW, h);
    p.center(cg, gx + romanW / 2, rowTop - h / 2 - 3, { size: 7.5, font: fonts.bold });
    EVENTS.forEach((e, i) => {
      const x = gx + romanW + i * colW;
      const earned = e === event && r.earnedGroups.includes(cg);
      p.box(x, rowTop - h, colW, h, { fill: e === event ? HIGHLIGHT : undefined });
      const egs = APPARATUS[e].condensed[cg];
      const startY = rowTop - h / 2 + ((egs.length - 1) * lineH) / 2 - 2.5;
      egs.forEach((n, k) =>
        p.text(`${n}. ${APPARATUS[e].groups[n]}`, x + 4, startY - k * lineH, {
          size: 7,
          font: earned ? fonts.bold : fonts.regular,
          color: earned ? GOOD : INK,
          maxWidth: colW - 8,
        })
      );
    });
    rowTop -= h;
  });
}

function drawSummaryPage(doc, fonts, logo, athlete, score) {
  const page = doc.addPage([W, H]);
  const p = painter(page, fonts);
  drawHeader(page, p, fonts, logo, 'UCG Infinity Start Value Summary');

  const hy = 488;
  p.text('Gymnast Name:', 110, hy, { size: 10 });
  p.line(185, hy - 2, 440, hy - 2, 0.5);
  p.text(athlete.name, 189, hy + 1, { size: 11, font: fonts.bold, maxWidth: 248 });
  p.text('Gymnast Club:', 460, hy, { size: 10 });
  p.line(528, hy - 2, 700, hy - 2, 0.5);
  p.text(athlete.club, 532, hy + 1, { size: 11, font: fonts.bold, maxWidth: 166 });

  // Vault
  let y = 440;
  p.box(110, y - 14, 590, 14, { fill: HEAD, border: HEAD });
  p.text('Vault', 116, y - 10.5, { size: 8.5, font: fonts.bold, color: WHITE });
  y -= 14;
  p.box(110, y - 56, 590, 56);
  const v = score.vault;
  if (v) {
    p.text(v.name, 120, y - 20, { size: 13, font: fonts.bold, maxWidth: 440 });
    p.text(`Entry type: ${v.entry}     USAG VT #: ${v.usag}     D score: ${fmt(v.dv)}`, 120, y - 40, { size: 10, color: MUTED });
    p.text('Start Value', 600, y - 20, { size: 8, color: MUTED });
    p.text(v.startValue.toFixed(2), 600, y - 42, { size: 20, font: fonts.bold });
  } else {
    p.text('No vault selected', 120, y - 32, { size: 11, color: MUTED });
  }

  // Event breakdown table
  y -= 90;
  const cols = [
    ['Event', 110, 150],
    ['Execution', 260, 70],
    ['Difficulty', 330, 70],
    ['EG Bonus', 400, 70],
    ['Event Bonus', 470, 76],
    ['Short of 6', 546, 70],
    ['Start Value', 616, 84],
  ];
  p.box(110, y - 16, 590, 16, { fill: HEAD, border: HEAD });
  cols.forEach(([h, x, w], i) =>
    i ? p.center(h, x + w / 2, y - 11.5, { size: 8, font: fonts.bold, color: WHITE }) : p.text(h, x + 6, y - 11.5, { size: 8, font: fonts.bold, color: WHITE })
  );
  y -= 16;
  const rows = [
    ['Vault', v ? '10.0' : '', v ? fmt(v.dv) : '', '', '', '', v ? v.startValue.toFixed(2) : '-'],
    ...EVENTS.map((e) => {
      const r = score.events[e];
      if (!r.rows.length) return [APPARATUS[e].label, '', '', '', '', '', '-'];
      return [APPARATUS[e].label, '10.0', fmt(r.difficulty), fmt(r.egTotal), fmt(r.eventBonus), r.shortBy ? `-${fmt(r.shortBy)}` : '0.0', r.startValue.toFixed(2)];
    }),
  ];
  for (const row of rows) {
    cols.forEach(([, x, w], i) => {
      p.box(x, y - 24, w, 24);
      if (i === 0) p.text(row[0], x + 6, y - 16, { size: 11 });
      else p.center(row[i], x + w / 2, y - 16, { size: 11, font: i === cols.length - 1 ? fonts.bold : fonts.regular });
    });
    y -= 24;
  }
  p.box(110, y - 34, 506, 34, { fill: SUBHEAD });
  p.text('All-Around Start Value', 120, y - 22, { size: 13, font: fonts.bold });
  p.box(616, y - 34, 84, 34, { thickness: 1.5, border: INK });
  p.center(score.allAround.toFixed(2), 658, y - 24, { size: 18, font: fonts.bold });
}

export async function exportAthletePdf(athlete, events = EVENTS, { includeSummary = true } = {}) {
  const score = scoreAthlete(athlete);
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  const logo = await loadLogo(doc);

  if (includeSummary) drawSummaryPage(doc, fonts, logo, athlete, score);
  for (const e of events) drawEventPage(doc, fonts, logo, athlete, e, score.events[e]);

  doc.setTitle(`${athlete.name || 'Athlete'} - UCG Infinity Start Values`);
  const bytes = await doc.save();
  return bytes;
}

export function downloadPdf(bytes, athlete, events = EVENTS) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const suffix = events.length === 1 ? ` ${APPARATUS[events[0]].short}` : '';
  a.download = `${(athlete.name || 'Athlete').trim()} SV Sheet${suffix}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
