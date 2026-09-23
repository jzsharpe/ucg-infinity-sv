import * as store from './store.js';
import { VAULTS } from './vaults.js';
import {
  APPARATUS,
  EVENTS,
  LETTERS,
  MAX_SKILLS,
  MIN_SKILLS,
  EVENT_BONUS,
  fmt,
  scoreAthlete,
} from './scoring.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const app = $('#app');
const state = { user: null, athletes: [], selectedId: null };

const blankRoutine = () => Array.from({ length: MAX_SKILLS }, () => ({ name: '', letter: '', eg: '' }));
const newAthlete = () => ({
  id: store.newId(),
  name: '',
  club: '',
  vault: '',
  routines: Object.fromEntries(EVENTS.map((e) => [e, blankRoutine()])),
  eventBonus: Object.fromEntries(EVENTS.map((e) => [e, false])),
  createdAt: Date.now(),
});

// Older/partial records: make sure every event has MAX_SKILLS rows.
function normalize(a) {
  a.routines ||= {};
  a.eventBonus ||= {};
  for (const e of EVENTS) {
    const r = a.routines[e] || [];
    a.routines[e] = [...r, ...blankRoutine()].slice(0, MAX_SKILLS);
  }
  return a;
}

const selected = () => state.athletes.find((a) => a.id === state.selectedId);

// ---- Saving ---------------------------------------------------------------

let saveTimer;
function setStatus(text, kind = '') {
  const el = $('#save-status');
  if (el) {
    el.textContent = text;
    el.dataset.kind = kind;
  }
}
function scheduleSave() {
  setStatus('Saving…');
  clearTimeout(saveTimer);
  const athlete = selected();
  saveTimer = setTimeout(async () => {
    try {
      await store.saveAthlete(athlete);
      setStatus('All changes saved', 'ok');
    } catch (err) {
      console.error(err);
      setStatus('Could not save. Check your connection.', 'error');
    }
  }, 600);
}

// ---- Header / auth ---------------------------------------------------------

function renderUserArea() {
  const area = $('#user-area');
  const u = state.user;
  if (!u || u.local) {
    area.innerHTML = '';
    return;
  }
  area.innerHTML = `
    ${u.photoURL ? `<img class="avatar" src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer" />` : ''}
    <span class="user-name">${esc(u.displayName || u.email)}</span>
    <button class="topbar-link" id="signout-btn" type="button">Sign out</button>`;
  $('#signout-btn').onclick = () => store.signOut();
}

function renderSignIn() {
  app.innerHTML = '';
  app.appendChild($('#signin-tpl').content.cloneNode(true));
  $('#signin-btn').onclick = async () => {
    const err = $('#signin-error');
    err.hidden = true;
    try {
      await store.signIn();
    } catch (e) {
      if (e?.code === 'auth/popup-closed-by-user') return;
      err.textContent = `Sign-in failed: ${e?.message || e}`;
      err.hidden = false;
    }
  };
}

// ---- Main layout -----------------------------------------------------------

function renderShell() {
  app.innerHTML = `
    <section class="page-head">
      <div class="page-head-inner">
        <p class="eyebrow">WAG Open Scoring</p>
        <h1>Start value sheets</h1>
      </div>
    </section>
    <div class="layout">
      <aside class="sidebar">
        <div class="sidebar-head">
          <h2 class="subhead">Athletes</h2>
          <button class="btn btn-primary btn-sm" id="add-athlete" type="button">Add athlete</button>
        </div>
        <ul id="athlete-list" class="athlete-list"></ul>
      </aside>
      <section id="editor" class="editor"></section>
    </div>`;
  $('#add-athlete').onclick = addAthlete;
  renderList();
  renderEditor();
}

function sortedAthletes() {
  return [...state.athletes].sort((a, b) =>
    (a.name || '~').localeCompare(b.name || '~', undefined, { sensitivity: 'base' })
  );
}

function renderList() {
  const list = $('#athlete-list');
  if (!list) return;
  if (!state.athletes.length) {
    list.innerHTML = `<li class="empty">No athletes yet.</li>`;
    return;
  }
  list.innerHTML = sortedAthletes()
    .map((a) => {
      const aa = scoreAthlete(a).allAround;
      return `<li>
        <button type="button" data-id="${esc(a.id)}" class="athlete-item${a.id === state.selectedId ? ' active' : ''}">
          <span class="athlete-name">${esc(a.name || 'Unnamed athlete')}</span>
          <span class="athlete-meta">${esc(a.club || '')}</span>
          <span class="athlete-aa">${fmt(aa)}</span>
        </button>
      </li>`;
    })
    .join('');
  $$('.athlete-item', list).forEach((b) => (b.onclick = () => select(b.dataset.id)));
}

function select(id) {
  state.selectedId = id;
  try {
    localStorage.setItem('sv-selected', id);
  } catch {}
  renderList();
  renderEditor();
}

async function addAthlete() {
  const a = newAthlete();
  state.athletes.push(a);
  select(a.id);
  $('#f-name')?.focus();
  try {
    await store.saveAthlete(a);
  } catch (e) {
    console.error(e);
  }
}

async function removeAthlete() {
  const a = selected();
  if (!a || !confirm(`Delete ${a.name || 'this athlete'} and all of their routines? This can't be undone.`)) return;
  await store.deleteAthlete(a.id);
  state.athletes = state.athletes.filter((x) => x.id !== a.id);
  state.selectedId = sortedAthletes()[0]?.id ?? null;
  renderList();
  renderEditor();
}

// ---- Editor ----------------------------------------------------------------

function vaultOptions(current) {
  const groups = {};
  for (const v of VAULTS) (groups[v.entry] ||= []).push(v);
  return (
    `<option value="">— No vault —</option>` +
    Object.entries(groups)
      .map(
        ([entry, list]) =>
          `<optgroup label="${esc(entry)}">${list
            .map(
              (v) =>
                `<option value="${esc(v.name)}"${v.name === current ? ' selected' : ''}>${esc(v.name)} (${fmt(v.dv)})</option>`
            )
            .join('')}</optgroup>`
      )
      .join('')
  );
}

function skillRow(event, i, s) {
  const groups = APPARATUS[event].groups;
  return `
    <div class="skill-row" data-row="${i}">
      <span class="col-num">${i + 1}</span>
      <input class="col-name" type="text" placeholder="Skill name" aria-label="Skill ${i + 1} name"
        data-event="${event}" data-idx="${i}" data-field="name" value="${esc(s.name)}" />
      <select class="col-letter" aria-label="Skill ${i + 1} difficulty" data-event="${event}" data-idx="${i}" data-field="letter">
        <option value="">–</option>
        ${LETTERS.map((l) => `<option${l === s.letter ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <select class="col-eg" aria-label="Skill ${i + 1} element group" data-event="${event}" data-idx="${i}" data-field="eg">
        <option value="">EG –</option>
        ${Object.entries(groups)
          .map(([n, label]) => `<option value="${n}"${String(n) === String(s.eg) ? ' selected' : ''}>${n}. ${esc(label)}</option>`)
          .join('')}
      </select>
      <span class="col-value calc" data-calc="value"></span>
      <span class="col-cg calc" data-calc="cg"></span>
      <span class="col-bonus calc" data-calc="bonus"></span>
    </div>`;
}

function eventCard(event, athlete) {
  const ap = APPARATUS[event];
  const condensed = Object.entries(ap.condensed)
    .map(
      ([cg, egs]) =>
        `<li data-cg="${cg}"><span class="cg-badge">${cg}</span><span>${egs
          .map((n) => `${n}. ${esc(ap.groups[n])}`)
          .join(' · ')}</span></li>`
    )
    .join('');
  return `
    <article class="card event-card" data-event-card="${event}">
      <header class="card-head">
        <h2 class="card-title">${ap.label}</h2>
        <div class="card-head-right">
          <span class="sv-pill" data-sv="${event}"></span>
          <button class="btn btn-ghost btn-sm" type="button" data-export="${event}">Export PDF</button>
        </div>
      </header>
      <div class="skill-table">
        <div class="skill-row skill-head">
          <span class="col-num">#</span>
          <span class="col-name">Skill</span>
          <span class="col-letter">Diff.</span>
          <span class="col-eg">Element group</span>
          <span class="col-value">Value</span>
          <span class="col-cg">CEG</span>
          <span class="col-bonus">Bonus</span>
        </div>
        ${athlete.routines[event].map((s, i) => skillRow(event, i, s)).join('')}
      </div>
      <label class="event-bonus">
        <input type="checkbox" data-bonus="${event}"${athlete.eventBonus?.[event] ? ' checked' : ''} />
        <span class="event-bonus-text"><strong>Event bonus +${fmt(EVENT_BONUS)}</strong><span>${esc(ap.eventBonus)}</span></span>
        <span class="event-bonus-value calc" data-calc="event-bonus"></span>
      </label>
      <div class="event-foot">
        <ul class="cg-list">${condensed}</ul>
        <dl class="totals">
          <div><dt>Execution</dt><dd>10.0</dd></div>
          <div><dt>Difficulty</dt><dd data-total="difficulty"></dd></div>
          <div><dt>EG bonus</dt><dd data-total="eg"></dd></div>
          <div><dt>Event bonus</dt><dd data-total="event-bonus"></dd></div>
          <div><dt>Short of ${MIN_SKILLS}</dt><dd data-total="short"></dd></div>
          <div class="grand"><dt>Start value</dt><dd data-total="sv"></dd></div>
        </dl>
      </div>
    </article>`;
}

function renderEditor() {
  const ed = $('#editor');
  if (!ed) return;
  const a = selected();
  if (!a) {
    ed.innerHTML = `
      <div class="card empty-editor">
        <h2>Add your first athlete</h2>
        <p>Each athlete gets a vault plus bars, beam, and floor routines. Start values update as you type, and you can export a filled-in worksheet PDF.</p>
        <button class="btn btn-primary" type="button" id="empty-add">Add athlete</button>
      </div>`;
    $('#empty-add').onclick = addAthlete;
    return;
  }

  ed.innerHTML = `
    <div class="editor-head">
      <div class="fields">
        <label class="field grow"><span>Gymnast name</span>
          <input id="f-name" type="text" data-field="name" value="${esc(a.name)}" placeholder="Name" /></label>
        <label class="field"><span>Club</span>
          <input id="f-club" type="text" data-field="club" value="${esc(a.club)}" placeholder="Club / school" /></label>
      </div>
      <div class="editor-actions">
        <span id="save-status" class="save-status"></span>
        <button class="btn btn-primary" type="button" id="export-all">Export PDF</button>
        <button class="btn btn-quiet" type="button" id="delete-athlete">Delete</button>
      </div>
    </div>

    <div class="summary" id="summary"></div>

    <article class="card vault-card">
      <header class="card-head">
        <h2 class="card-title">Vault</h2>
        <div class="card-head-right"><span class="sv-pill" data-sv="vault"></span></div>
      </header>
      <div class="vault-body">
        <label class="field grow"><span>Select your vault</span>
          <select id="f-vault">${vaultOptions(a.vault)}</select></label>
        <dl class="vault-info" id="vault-info"></dl>
      </div>
    </article>

    ${EVENTS.map((e) => eventCard(e, a)).join('')}
  `;

  $('#f-name').oninput = (ev) => {
    a.name = ev.target.value;
    renderListSoon();
    scheduleSave();
  };
  $('#f-club').oninput = (ev) => {
    a.club = ev.target.value;
    renderListSoon();
    scheduleSave();
  };
  $('#f-vault').onchange = (ev) => {
    a.vault = ev.target.value;
    updateComputed();
    scheduleSave();
  };
  $('#delete-athlete').onclick = removeAthlete;
  $('#export-all').onclick = (ev) => runExport(ev.currentTarget, EVENTS);
  $$('[data-export]', ed).forEach((b) => (b.onclick = () => runExport(b, [b.dataset.export], false)));

  ed.oninput = onSkillInput;
  updateComputed();
}

function onSkillInput(ev) {
  const t = ev.target;
  const a = selected();
  if (t.dataset.bonus) {
    a.eventBonus[t.dataset.bonus] = t.checked;
    updateComputed();
    scheduleSave();
    return;
  }
  if (!t.dataset.event) return;
  a.routines[t.dataset.event][Number(t.dataset.idx)][t.dataset.field] = t.value;
  updateComputed();
  scheduleSave();
}

let listTimer;
function renderListSoon() {
  clearTimeout(listTimer);
  listTimer = setTimeout(renderList, 250);
}

function updateComputed() {
  const a = selected();
  if (!a) return;
  const score = scoreAthlete(a);

  // Vault
  const v = score.vault;
  $('#vault-info').innerHTML = v
    ? `<div><dt>Entry type</dt><dd>${esc(v.entry)}</dd></div>
       <div><dt>USAG VT #</dt><dd>${esc(v.usag)}</dd></div>
       <div><dt>D score</dt><dd>${fmt(v.dv)}</dd></div>`
    : '';
  $('[data-sv="vault"]').textContent = v ? v.startValue.toFixed(1) : '—';

  for (const e of EVENTS) {
    const card = $(`[data-event-card="${e}"]`);
    const r = score.events[e];
    // Map the scored (filled) rows back onto the 8 input rows.
    let k = 0;
    a.routines[e].forEach((s, i) => {
      const rowEl = $(`[data-row="${i}"]`, card);
      const filled = String(s.name || '').trim() || s.letter;
      const res = filled ? r.rows[k++] : null;
      $('[data-calc="value"]', rowEl).textContent = res?.letter ? fmt(res.value) : '';
      $('[data-calc="cg"]', rowEl).textContent = res?.condensed ?? '';
      $('[data-calc="bonus"]', rowEl).textContent = res?.bonus ? `+${fmt(res.bonus)}` : '';
      rowEl.classList.toggle('has-bonus', !!res?.bonus);
    });
    $$('.cg-list li', card).forEach((li) => li.classList.toggle('earned', r.earnedGroups.includes(li.dataset.cg)));
    $('[data-total="difficulty"]', card).textContent = fmt(r.difficulty);
    $('[data-total="eg"]', card).textContent = fmt(r.egTotal);
    $('[data-total="event-bonus"]', card).textContent = fmt(r.eventBonus);
    $('[data-calc="event-bonus"]', card).textContent = r.eventBonus ? `+${fmt(r.eventBonus)}` : '';
    $('.event-bonus', card).classList.toggle('on', !!r.eventBonus);
    $('[data-total="short"]', card).textContent = r.shortBy ? `−${fmt(r.shortBy)}` : '0.0';
    $('[data-total="sv"]', card).textContent = r.startValue.toFixed(1);
    $(`[data-sv="${e}"]`).textContent = r.rows.length ? r.startValue.toFixed(1) : '—';
  }

  $('#summary').innerHTML = [
    ['Vault', v?.startValue],
    ...EVENTS.map((e) => [APPARATUS[e].short, score.events[e].rows.length ? score.events[e].startValue : null]),
  ]
    .map(([label, sv]) => `<div class="stat"><span>${label}</span><strong>${sv == null ? '—' : sv.toFixed(1)}</strong></div>`)
    .join('') + `<div class="stat stat-aa"><span>All-Around</span><strong>${score.allAround.toFixed(1)}</strong></div>`;

  renderListSoon();
}

async function runExport(button, events, includeSummary = true) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Building PDF…';
  try {
    const { exportAthletePdf, downloadPdf } = await import('./pdf.js');
    const athlete = selected();
    downloadPdf(await exportAthletePdf(athlete, events, { includeSummary }), athlete, events);
  } catch (e) {
    console.error(e);
    alert(`Could not create the PDF: ${e?.message || e}`);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// ---- Boot -----------------------------------------------------------------

async function onUser(user) {
  state.user = user;
  renderUserArea();
  if (!user) {
    state.athletes = [];
    renderSignIn();
    return;
  }
  $('#local-banner').hidden = !user.local;
  app.innerHTML = `<p class="loading">Loading athletes…</p>`;
  try {
    state.athletes = (await store.listAthletes()).map(normalize);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<p class="error">Could not load athletes: ${esc(e?.message || e)}</p>`;
    return;
  }
  let remembered = null;
  try {
    remembered = localStorage.getItem('sv-selected');
  } catch {}
  state.selectedId = state.athletes.some((a) => a.id === remembered) ? remembered : sortedAthletes()[0]?.id ?? null;
  renderShell();
}

store.init(onUser).catch((e) => {
  console.error(e);
  app.innerHTML = `<p class="error">Could not start the app: ${esc(e?.message || e)}</p>`;
});
