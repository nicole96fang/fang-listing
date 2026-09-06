/* ============================================================
   Listing · app logic  (neutral minimalist, sidebar layout)
   - IndexedDB local storage (todos / shopping / diary / meta)
   - sidebar router: Main / To Do List / Shopping List
   - live clock (date + weekday + time, auto-updating)
   - sliding toggle switches for completion + progress bars
   - diary editor: date + mood + text + photos (base64)
   - backup export / restore import / 7-day reminder
   - photo lightbox, A4 print, storage.persist
   no backend, no ads.
   ============================================================ */

'use strict';

/* ---------- tiny helpers ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastT); toastT = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.hidden = true, 260); }, 2200);
}

/* ---------- IndexedDB ---------- */
const DB_NAME = 'listing-db', DB_VER = 1;
const STORES = { todos: 'todos', shopping: 'shopping', diary: 'diary', meta: 'meta' };
let db;

function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = e => {
      const d = r.result;
      for (const k of Object.keys(STORES)) if (!d.objectStoreNames.contains(k)) {
        const keyPath = (k === 'meta') ? 'key' : 'id';
        d.createObjectStore(k, { keyPath });
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror   = () => rej(r.error);
  });
}
function tx(store, mode = 'readonly') { return db.transaction(store, mode).objectStore(store); }
function reqP(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }

async function dbAll(store) { return reqP(tx(store).getAll()); }
async function dbGet(store, id) { return reqP(tx(store).get(id)); }
async function dbPut(store, val) { return reqP(tx(store, 'readwrite').put(val)); }
async function dbDel(store, id) { return reqP(tx(store, 'readwrite').delete(id)); }
async function dbClear(store) { return reqP(tx(store, 'readwrite').clear()); }
async function metaGet(key, dflt) { const r = await reqP(tx('meta').get(key)); return r == null ? dflt : r.value; }
async function metaPut(key, value) { return reqP(tx('meta', 'readwrite').put({ key, value })); }

/* ---------- state ---------- */
let currentMood = null;
let pendingPhotos = [];   // base64 strings for the entry being composed

/* ---------- view router ---------- */
const VIEWS = ['main', 'todo', 'shopping'];
const TITLES = { main: 'Main', todo: 'To Do List', shopping: 'Shopping List' };

function switchView(v) {
  if (!VIEWS.includes(v)) v = 'main';
  $$('.view').forEach(el => el.classList.toggle('is-active', el.id === 'view-' + v));
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === v));
  $('#viewTitle').textContent = TITLES[v];
  closeSidebar();
  // focus the right input when entering a typing view
  if (v === 'todo') setTimeout(() => $('#todoInput').focus(), 60);
  if (v === 'shopping') setTimeout(() => $('#shopInput').focus(), 60);
}

/* ---------- sidebar drawer ---------- */
function openSidebar()  { $('#sidebar').classList.add('open'); const s = $('#scrim'); s.hidden = false; requestAnimationFrame(() => s.classList.add('show')); }
function closeSidebar() { $('#sidebar').classList.remove('open'); const s = $('#scrim'); s.classList.remove('show'); setTimeout(() => s.hidden = true, 280); }

/* ---------- live clock (date + weekday + time) ---------- */
const WEEK = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MON  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function tickClock() {
  const d = new Date();
  const h = pad(d.getHours()), m = pad(d.getMinutes()), s = pad(d.getSeconds());
  $('#clockTime').textContent = `${h}:${m}:${s}`;
  $('#clockWeek').textContent = WEEK[d.getDay()];
  $('#clockDate').textContent = `${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  // tiny date in topbar
  $('#topbarDate').textContent = `${WEEK[d.getDay()].slice(0,3)} ${d.getDate()} ${MON[d.getMonth()].slice(0,3)}`;
}

/* ---------- To Do ---------- */
async function renderTodos() {
  const list = $('#todoList');
  const items = (await dbAll('todos')).sort((a,b) => (a.done - b.done) || (a.created - b.created));
  list.innerHTML = '';
  items.forEach(it => list.appendChild(todoItemEl(it)));
  const total = items.length, done = items.filter(i => i.done).length;
  const prog = $('#todoProgress');
  prog.hidden = total === 0;
  if (total) {
    const pct = done / total * 100;
    $('#todoProgressText').textContent = `${done} / ${total} done`;
    $('#todoProgressFill').style.width = pct + '%';
    $('#todoProgressKnob').style.left = pct + '%';
    prog.classList.toggle('is-complete', done === total);
  } else { prog.classList.remove('is-complete'); }
  $('#todoEmpty').hidden = total !== 0;
}
function todoItemEl(it) {
  const li = document.createElement('li');
  li.className = 'task-item' + (it.done ? ' done' : '');
  li.dataset.id = it.id;
  li.innerHTML = `
    <button class="toggle" aria-pressed="${it.done}" aria-label="Toggle complete"><span class="knob"></span></button>
    <span class="task-text"></span>
    <button class="del-btn" aria-label="Delete">✕</button>`;
  li.querySelector('.task-text').textContent = it.text;
  li.querySelector('.toggle').addEventListener('click', () => toggleTodo(it.id));
  li.querySelector('.del-btn').addEventListener('click', () => delTodo(it.id));
  return li;
}
async function addTodo() {
  const input = $('#todoInput');
  const text = input.value.trim();
  if (!text) return;
  await dbPut('todos', { id: crypto.randomUUID(), text, done: false, created: Date.now() });
  input.value = '';
  await renderTodos();
}
async function toggleTodo(id) {
  const it = await dbGet('todos', id); if (!it) return;
  it.done = !it.done;
  await dbPut('todos', it);
  await renderTodos();
}
async function delTodo(id) { await dbDel('todos', id); await renderTodos(); }

/* ---------- Shopping ---------- */
async function renderShopping() {
  const list = $('#shopList');
  const items = (await dbAll('shopping')).sort((a,b) => (a.done - b.done) || (a.created - b.created));
  list.innerHTML = '';
  items.forEach(it => list.appendChild(shopItemEl(it)));
  const total = items.length, done = items.filter(i => i.done).length;
  const prog = $('#shopProgress');
  prog.hidden = total === 0;
  if (total) {
    const pct = done / total * 100;
    $('#shopProgressText').textContent = `${done} / ${total} done`;
    $('#shopProgressFill').style.width = pct + '%';
    $('#shopProgressKnob').style.left = pct + '%';
    prog.classList.toggle('is-complete', done === total);
  } else { prog.classList.remove('is-complete'); }
  $('#shopEmpty').hidden = total !== 0;
}
function shopItemEl(it) {
  const li = document.createElement('li');
  li.className = 'task-item' + (it.done ? ' done' : '');
  li.dataset.id = it.id;
  li.innerHTML = `
    <button class="toggle" aria-pressed="${it.done}" aria-label="Toggle complete"><span class="knob"></span></button>
    <span class="task-text"></span>
    <div class="qty">
      <button class="qty-btn" data-d="-1" aria-label="Decrease">−</button>
      <span class="qty-val"></span>
      <button class="qty-btn" data-d="1" aria-label="Increase">＋</button>
    </div>
    <button class="del-btn" aria-label="Delete">✕</button>`;
  li.querySelector('.task-text').textContent = `${it.text}`;
  li.querySelector('.qty-val').textContent = it.qty;
  li.querySelector('.toggle').addEventListener('click', () => toggleShop(it.id));
  li.querySelector('.del-btn').addEventListener('click', () => delShop(it.id));
  li.querySelectorAll('.qty-btn').forEach(b => b.addEventListener('click', () => changeQty(it.id, +b.dataset.d)));
  return li;
}
async function addShopping() {
  const input = $('#shopInput');
  const text = input.value.trim();
  if (!text) return;
  await dbPut('shopping', { id: crypto.randomUUID(), text, qty: 1, done: false, created: Date.now() });
  input.value = '';
  await renderShopping();
}
async function toggleShop(id) {
  const it = await dbGet('shopping', id); if (!it) return;
  it.done = !it.done;
  await dbPut('shopping', it);
  await renderShopping();
}
async function changeQty(id, d) {
  const it = await dbGet('shopping', id); if (!it) return;
  it.qty = Math.max(1, (it.qty || 1) + d);
  await dbPut('shopping', it);
  await renderShopping();
}
async function delShop(id) { await dbDel('shopping', id); await renderShopping(); }

/* ---------- Diary ---------- */
function selectMood(mood, el) {
  currentMood = mood;
  $$('.mood').forEach(m => m.classList.toggle('selected', m === el));
}
async function renderEntries() {
  const box = $('#entries');
  const items = (await dbAll('diary')).sort((a, b) => b.created - a.created);
  box.innerHTML = '';
  if (!items.length) {
    box.innerHTML = '<p class="empty-hint" style="text-align:left">No diary entries yet. Write your first one above.</p>';
    return;
  }
  for (const e of items) box.appendChild(entryEl(e));
}
function entryEl(e) {
  const d = new Date(e.created);
  const ds = `${WEEK[d.getDay()].slice(0,3)} ${MON[d.getMonth()].slice(0,3)} ${d.getDate()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const art = document.createElement('article');
  art.className = 'entry';
  let photos = '';
  if (e.photos && e.photos.length) {
    photos = '<div class="entry-photos">' + e.photos.map(p => `<img src="${p}" alt="photo">`).join('') + '</div>';
  }
  art.innerHTML = `
    <div class="entry-head">
      ${e.mood ? `<span class="entry-mood">${esc(e.mood)}</span>` : ''}
      <span class="entry-date">${ds}</span>
    </div>
    <div class="entry-body"></div>
    ${photos}
    <button class="entry-del">Delete entry</button>`;
  art.querySelector('.entry-body').textContent = e.text || '';
  art.querySelectorAll('img').forEach(img => img.addEventListener('click', () => openLightbox(img.src)));
  art.querySelector('.entry-del').addEventListener('click', () => delEntry(e.id));
  return art;
}
async function saveDiary() {
  const text = $('#diaryText').value.trim();
  if (!text && !pendingPhotos.length && !currentMood) { toast('Write something first ✎'); return; }
  await dbPut('diary', {
    id: crypto.randomUUID(),
    mood: currentMood,
    text,
    photos: pendingPhotos.slice(),
    created: Date.now(),
  });
  // reset composer
  $('#diaryText').value = '';
  pendingPhotos = [];
  $('#photoThumbs').innerHTML = '';
  currentMood = null;
  $$('.mood').forEach(m => m.classList.remove('selected'));
  await renderEntries();
  toast('Entry saved 💛');
}
async function delEntry(id) { await dbDel('diary', id); await renderEntries(); }

/* ---------- photo attach (compressed base64) ---------- */
function readPhotos(files) {
  const arr = [...files];
  if (!arr.length) return;
  let i = 0;
  const next = () => {
    if (i >= arr.length) { renderPhotoThumbs(); return; }
    const f = arr[i++];
    compressImage(f, 1100, 0.82).then(data => { pendingPhotos.push(data); next(); })
      .catch(() => {
        // fallback: raw data url if canvas fails (keeps photo visible)
        const r = new FileReader(); r.onload = () => { pendingPhotos.push(r.result); next(); }; r.readAsDataURL(f);
      });
  };
  next();
}
function compressImage(file, maxSide, q) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > maxSide || h > maxSide) {
          const s = maxSide / Math.max(w, h);
          w = Math.round(w * s); h = Math.round(h * s);
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        res(c.toDataURL('image/jpeg', q));
      };
      img.onerror = rej;
      img.src = r.result;
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function renderPhotoThumbs() {
  const box = $('#photoThumbs');
  box.innerHTML = '';
  pendingPhotos.forEach((src, idx) => {
    const img = document.createElement('img');
    img.src = src; img.alt = 'photo'; img.dataset.idx = idx;
    img.addEventListener('click', () => { pendingPhotos.splice(idx, 1); renderPhotoThumbs(); });
    box.appendChild(img);
  });
}

/* ---------- lightbox ---------- */
function openLightbox(src) { $('#lbImg').src = src; $('#lightbox').hidden = false; }
function closeLightbox() { $('#lightbox').hidden = true; $('#lbImg').src = ''; }

/* ---------- backup / restore ---------- */
async function backup() {
  const data = {
    app: 'Listing', version: 1, exportedAt: new Date().toISOString(),
    todos: await dbAll('todos'),
    shopping: await dbAll('shopping'),
    diary: await dbAll('diary'),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `listing-backup-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  await metaPut('lastBackup', Date.now());
  toast('Backup downloaded ✅');
}
function restore() { $('#restoreInput').click(); }
async function doRestore(ev) {
  const f = ev.target.files[0]; if (!f) return;
  try {
    const text = await f.text();
    const d = JSON.parse(text);
    if (!d || (d.app !== 'Listing' && !Array.isArray(d.todos) && !Array.isArray(d.diary))) {
      throw new Error('Not a Listing backup file');
    }
    if (confirm('Restore will replace all current data with the backup. Continue?')) {
      if (Array.isArray(d.todos))    { await dbClear('todos');    for (const i of d.todos)    await dbPut('todos', i); }
      if (Array.isArray(d.shopping)) { await dbClear('shopping'); for (const i of d.shopping) await dbPut('shopping', i); }
      if (Array.isArray(d.diary))    { await dbClear('diary');    for (const i of d.diary)    await dbPut('diary', i); }
      await renderAll();
      await metaPut('lastBackup', Date.now());
      toast('Restored ✅');
    }
  } catch (err) {
    toast('Could not read that file');
  }
  ev.target.value = '';
}

/* ---------- print ---------- */
function doPrint() { window.print(); }

/* ---------- backup reminder (every 7 days) ---------- */
async function checkReminder() {
  const last = await metaGet('lastBackup', 0);
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (last === 0) return; // never backed up → skip nag until they do once
  if (Date.now() - last > sevenDays) $('#reminder').hidden = false;
}

/* ---------- render all ---------- */
async function renderAll() {
  await Promise.all([renderTodos(), renderShopping(), renderEntries()]);
}

/* ---------- wire up ---------- */
async function init() {
  db = await openDB();

  // request persistent storage so clearing Safari data is less likely to wipe it
  if (navigator.storage && navigator.storage.persist) {
    try { await navigator.storage.persist(); } catch (_) {}
  }

  // clock — auto-updating every second
  tickClock();
  setInterval(tickClock, 1000);

  // nav + sidebar
  $$('.nav-item').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
  $('#menuBtn').addEventListener('click', openSidebar);
  $('#scrim').addEventListener('click', closeSidebar);

  // todos
  $('#todoAdd').addEventListener('click', addTodo);
  $('#todoInput').addEventListener('keydown', e => { if (e.key === 'Enter') addTodo(); });

  // shopping
  $('#shopAdd').addEventListener('click', addShopping);
  $('#shopInput').addEventListener('keydown', e => { if (e.key === 'Enter') addShopping(); });

  // moods + diary
  $$('.mood').forEach(m => m.addEventListener('click', () => selectMood(m.dataset.mood, m)));
  $('#diarySave').addEventListener('click', saveDiary);
  $('#photoInput').addEventListener('change', e => readPhotos(e.target.files));

  // backup / restore / print
  $('#backupBtn').addEventListener('click', backup);
  $('#restoreBtn').addEventListener('click', restore);
  $('#restoreInput').addEventListener('change', doRestore);
  $('#printBtn').addEventListener('click', doPrint);

  // reminder
  $('#reminderBackup').addEventListener('click', async () => { await backup(); $('#reminder').hidden = true; });
  $('#reminderClose').addEventListener('click', () => { $('#reminder').hidden = true; });

  // lightbox
  $('#lbClose').addEventListener('click', closeLightbox);
  $('#lightbox').addEventListener('click', e => { if (e.target === $('#lightbox')) closeLightbox(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeLightbox(); closeSidebar(); } });

  // initial render
  await renderAll();
  await checkReminder();

  // live render of any view if user returns
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });
}

document.addEventListener('DOMContentLoaded', init);
