import * as store from './store.js';
import { VAULTS } from './vaults.js';
import {
  APPARATUS,
  EVENTS,
  LETTERS,
  MAX_SKILLS,
  MAX_ROUTINE,
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
const TABS = ['vault', ...EVENTS];
const state = { user: null, athletes: [], selectedId: null, tab: readTab() };

function readTab() {
  try {
    const t = localStorage.getItem('sv-tab');
    return TABS.includes(t) ? t : 'vault';
  } catch {
    return 'vault';
  }
}

const blankSkill = () => ({ name: '', letter: '', eg: '' });
const blankRoutine = () => Array.from({ length: MAX_SKILLS }, blankSkill);
const isBlank = (s) => !String(s?.name || '').trim() && !s?.letter;
const newAthlete = () => ({
  id: store.newId(),
  name: '',
  club: '',
  vault: '',
  routines: Object.fromEntries(EVENTS.map((e) => [e, blankRoutine()])),
  eventBonus: Object.fromEntries(EVENTS.map((e) => [e, false])),
  createdAt: Date.now(),
});

// Older/partial records: every routine shows at least MAX_SKILLS rows.
// Records from before routines could hold non-counting skills kept separate
// "EG bonus skills" (egSkills); those move to the end of the routine, where a
// non-counting skill earns the same element group credit. Returns true if the
// record changed and should be saved.
function normalize(a) {
  let migrated = false;
  a.routines ||= {};
  a.eventBonus ||= {};
  for (const e of EVENTS) {
    let r = [...(a.routines[e] || [])];
    const extra = (a.egSkills?.[e] || []).filter((x) => !isBlank(x));
    if (extra.length) {
      while (r.length && isBlank(r[r.length - 1])) r.pop();
      r.push(...extra);
      migrated = true;
    }
    while (r.length < MAX_SKILLS) r.push(blankSkill());
    a.routines[e] = r.slice(0, MAX_ROUTINE);
  }
  if ('egSkills' in a) {
    delete a.egSkills;
    migrated = true;
  }
  return migrated;
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
        <p class="eyebrow">UCG Infinity</p>
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

const ICON_GRIP = `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>`;
const ICON_X = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

function skillRow(event, i, s) {
  const groups = APPARATUS[event].groups;
  const label = `Skill ${i + 1}`;
  const data = `data-event="${event}" data-idx="${i}"`;
  return `
    <div class="skill-row" data-row="${i}">
      <span class="col-num">
        <button type="button" class="drag-handle" data-drag="${event}" data-idx="${i}"
          aria-label="Move ${label}. Drag, or use the up and down arrow keys." title="Drag to reorder">${ICON_GRIP}</button>
        <span class="num">${i + 1}</span>
      </span>
      <input class="col-name" type="text" placeholder="Skill name" aria-label="${label} name"
        ${data} data-field="name" value="${esc(s.name)}" />
      <select class="col-letter" aria-label="${label} difficulty" ${data} data-field="letter">
        <option value="">–</option>
        ${LETTERS.map((l) => `<option${l === s.letter ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <select class="col-eg" aria-label="${label} element group" ${data} data-field="eg">
        <option value="">EG –</option>
        ${Object.entries(groups)
          .map(([n, g]) => `<option value="${n}"${String(n) === String(s.eg) ? ' selected' : ''}>${n}. ${esc(g)}</option>`)
          .join('')}
      </select>
      <span class="col-value calc" data-calc="value"></span>
      <span class="col-cg calc" data-calc="cg"></span>
      <span class="col-bonus calc" data-calc="bonus"></span>
      <button type="button" class="remove-skill" data-remove-skill="${event}" data-idx="${i}" aria-label="Remove ${label}" title="Remove skill">${ICON_X}</button>
      <span class="row-note" data-calc="note"></span>
    </div>`;
}

function routineRows(event, athlete) {
  return `
    <div class="skill-row skill-head" aria-hidden="true">
      <span class="col-num">#</span>
      <span class="col-name">Skill</span>
      <span class="col-letter">Diff.</span>
      <span class="col-eg">Element group</span>
      <span class="col-value">Value</span>
      <span class="col-cg">CEG</span>
      <span class="col-bonus">Bonus</span>
      <span></span>
    </div>
    ${athlete.routines[event].map((s, i) => skillRow(event, i, s)).join('')}`;
}

// Re-draw one event's routine (after add / remove / reorder) and optionally
// focus something in it: { row, part: 'name' | 'handle' } or 'add'.
function renderRoutine(event, focus) {
  const a = selected();
  $(`[data-routine="${event}"]`).innerHTML = routineRows(event, a);
  updateComputed();
  if (focus === 'add') $(`[data-add-skill="${event}"]`)?.focus();
  else if (focus) {
    const row = $(`[data-routine="${event}"] [data-row="${focus.row}"]`);
    $(focus.part === 'handle' ? '.drag-handle' : '.col-name', row)?.focus();
  }
}

function moveSkill(event, from, to, focusPart) {
  const list = selected().routines[event];
  if (to < 0 || to >= list.length || to === from) return;
  const [skill] = list.splice(from, 1);
  list.splice(to, 0, skill);
  renderRoutine(event, { row: to, part: focusPart });
  scheduleSave();
}

function onEditorClick(ev) {
  const a = selected();
  const add = ev.target.closest('[data-add-skill]');
  if (add) {
    const e = add.dataset.addSkill;
    const list = a.routines[e];
    if (list.length >= MAX_ROUTINE) return;
    list.push(blankSkill());
    renderRoutine(e, { row: list.length - 1, part: 'name' });
    scheduleSave();
    return;
  }
  const remove = ev.target.closest('[data-remove-skill]');
  if (remove) {
    const e = remove.dataset.removeSkill;
    const list = a.routines[e];
    const i = Number(remove.dataset.idx);
    list.splice(i, 1);
    if (list.length < MAX_SKILLS) list.push(blankSkill());
    renderRoutine(e, { row: Math.min(i, list.length - 1), part: 'name' });
    scheduleSave();
  }
}

function onEditorKey(ev) {
  const h = ev.target.closest('.drag-handle');
  if (!h || (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown')) return;
  ev.preventDefault();
  const from = Number(h.dataset.idx);
  moveSkill(h.dataset.drag, from, from + (ev.key === 'ArrowUp' ? -1 : 1), 'handle');
}

// Drag to reorder: pointer events, so it works with a mouse and on touch screens.
function onEditorPointerDown(ev) {
  const handle = ev.target.closest('.drag-handle');
  if (!handle || ev.button > 0) return;
  ev.preventDefault();
  const event = handle.dataset.drag;
  const from = Number(handle.dataset.idx);
  const container = $(`[data-routine="${event}"]`);
  const rows = $$('.skill-row[data-row]', container);
  const dragged = rows[from];
  const others = rows.filter((r) => r !== dragged);
  const pageMid = (r) => {
    const b = r.getBoundingClientRect();
    return b.top + scrollY + b.height / 2;
  };
  const mids = others.map(pageMid);
  const startY = ev.clientY + scrollY;
  let to = from;

  dragged.classList.add('dragging');

  const clearMarks = () => others.forEach((r) => r.classList.remove('drop-above', 'drop-below'));
  const move = (m) => {
    if (m.clientY < 90) scrollBy(0, -12);
    else if (m.clientY > innerHeight - 60) scrollBy(0, 12);
    const y = m.clientY + scrollY;
    dragged.style.transform = `translateY(${y - startY}px)`;
    to = mids.filter((mid) => mid < y).length;
    clearMarks();
    if (to === from) return;
    if (to < others.length) others[to].classList.add('drop-above');
    else others[others.length - 1].classList.add('drop-below');
  };
  const end = () => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', end);
    removeEventListener('pointercancel', end);
    clearMarks();
    dragged.classList.remove('dragging');
    dragged.style.transform = '';
    if (to !== from) moveSkill(event, from, to, 'handle');
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
}

const EXPORT_TIP =
  'Exports the 8 counting skills for each event, plus any non-counting skill that earns element group credit. ' +
  'Repeated skills and other non-counting skills are left off the worksheet.';

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
    <article class="card event-card" data-event-card="${event}" id="panel-${event}" data-panel="${event}" role="tabpanel" aria-labelledby="tab-${event}">
      <header class="card-head">
        <h2 class="card-title">${ap.label}</h2>
        <div class="card-head-right">
          <span class="sv-pill" data-sv="${event}"></span>
          <button class="btn btn-ghost btn-sm" type="button" data-export="${event}" title="${EXPORT_TIP}">Export PDF</button>
        </div>
      </header>
      <p class="routine-help">
        List the whole routine in order, and drag <span class="grip-inline">${ICON_GRIP}</span> to reorder.
        <strong>Each skill counts only once</strong>, and your ${MAX_SKILLS} highest-value skills count toward difficulty.
        Counting skills are highlighted; repeats and non-counting skills aren't, and a note under each says why.
      </p>
      <div class="skill-table" data-routine="${event}">${routineRows(event, athlete)}</div>
      <div class="routine-actions">
        <button class="btn btn-ghost btn-sm" type="button" data-add-skill="${event}">Add skill</button>
        <span class="routine-count" data-calc="count"></span>
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
        <button class="btn btn-primary" type="button" id="export-all" title="${EXPORT_TIP}">Export PDF</button>
        <button class="btn btn-quiet" type="button" id="delete-athlete">Delete</button>
      </div>
    </div>

    <div class="summary" id="summary" role="tablist" aria-label="Events"></div>

    <article class="card vault-card" id="panel-vault" data-panel="vault" role="tabpanel" aria-labelledby="tab-vault">
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
  ed.onclick = onEditorClick;
  ed.onkeydown = onEditorKey;
  ed.onpointerdown = onEditorPointerDown;
  $('#summary').onclick = (ev) => {
    const t = ev.target.closest('[data-tab]');
    if (t) selectTab(t.dataset.tab);
  };
  $('#summary').onkeydown = onTabKey;
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

function showPanel() {
  $$('[data-panel]').forEach((el) => (el.hidden = el.dataset.panel !== state.tab));
}

function selectTab(tab, focus = false) {
  state.tab = tab;
  try {
    localStorage.setItem('sv-tab', tab);
  } catch {}
  updateComputed();
  if (focus) $(`#tab-${tab}`)?.focus();
}

function onTabKey(ev) {
  const i = TABS.indexOf(state.tab);
  const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[ev.key];
  if (next == null || !ev.target.closest('[role="tab"]')) return;
  ev.preventDefault();
  selectTab(TABS[(next + TABS.length) % TABS.length], true);
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
    for (const it of r.items) {
      const rowEl = $(`[data-row="${it.idx}"]`, card);
      if (!rowEl) continue;
      const repeat = it.status === 'repeat';
      const nonCounting = it.status === 'noncounting';
      rowEl.classList.toggle('is-counting', it.status === 'counting');
      rowEl.classList.toggle('is-repeat', repeat);
      rowEl.classList.toggle('non-counting', nonCounting);
      rowEl.classList.toggle('has-bonus', !!it.bonus);
      $('[data-calc="value"]', rowEl).textContent = repeat ? '—' : it.letter ? fmt(it.value) : '';
      $('[data-calc="cg"]', rowEl).textContent = repeat ? '' : it.condensed ?? '';
      $('[data-calc="bonus"]', rowEl).textContent = it.bonus ? `+${fmt(it.bonus)}` : '';
      let note = '';
      if (repeat) note = `Repeat of skill ${it.repeatOf + 1}: each skill only counts once`;
      else if (nonCounting)
        note = it.bonus
          ? 'Non-counting skill · earns element group credit (+0.3)'
          : `Non-counting skill: not in your top ${MAX_SKILLS}`;
      $('[data-calc="note"]', rowEl).textContent = note;
    }
    const filled = r.items.filter((it) => it.status !== 'blank').length;
    $('[data-calc="count"]', card).textContent = `${r.rows.length} of ${MAX_SKILLS} counting · ${filled} skill${filled === 1 ? '' : 's'} listed`;
    $(`[data-add-skill="${e}"]`, card).hidden = a.routines[e].length >= MAX_ROUTINE;
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

  // The score tiles double as the event tabs.
  $('#summary').innerHTML =
    [
      ['vault', 'Vault', v?.startValue],
      ...EVENTS.map((e) => [e, APPARATUS[e].short, score.events[e].rows.length ? score.events[e].startValue : null]),
    ]
      .map(([id, label, sv]) => {
        const on = id === state.tab;
        return `<button type="button" class="stat stat-tab${on ? ' active' : ''}" role="tab" id="tab-${id}" data-tab="${id}"
          aria-selected="${on}" aria-controls="panel-${id}" tabindex="${on ? 0 : -1}">
          <span>${label}</span><strong>${sv == null ? '—' : sv.toFixed(1)}</strong></button>`;
      })
      .join('') + `<div class="stat stat-aa"><span>All-Around</span><strong>${score.allAround.toFixed(1)}</strong></div>`;
  showPanel();

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
    state.athletes = await store.listAthletes();
    for (const a of state.athletes) if (normalize(a)) store.saveAthlete(a).catch(console.error);
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
