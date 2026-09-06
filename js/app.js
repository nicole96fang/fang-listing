/* ============================================================
   Listing · app logic
   - IndexedDB local storage (todos / shopping / diary / meta)
   - auto-save, backup & restore, A4 print, falling bubbles
   - no backend · no ads · no account
   ============================================================ */

'use strict';

/* ---------- tiny helpers ---------- */
const $  = (s) => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => (s == null ? '' : String(s).replace(/[&<>"']/g, (c) => (
  { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
)));
const todayStr = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const fmtDate = (s) => {
  const d = new Date(s + 'T00:00:00');
  if (isNaN(d)) return s;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---------- IndexedDB ---------- */
const DB_NAME = 'listing_db', DB_VERSION = 1;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('todos'))    d.createObjectStore('todos',    { keyPath: 'id' });
      if (!d.objectStoreNames.contains('shopping')) d.createObjectStore('shopping', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('diary')) {
        const s = d.createObjectStore('diary', { keyPath: 'id' });
        s.createIndex('date', 'date', { unique: false });
      }
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}
function dbAll(store) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readonly');
    const r = t.objectStore(store).getAll();
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function dbGet(store, id) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readonly');
    const r = t.objectStore(store).get(id);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function dbPut(store, item) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).put(item);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
}
function dbDelete(store, id) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).delete(id);
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
}
function dbClear(store) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    t.objectStore(store).clear();
    t.oncomplete = () => res(); t.onerror = () => rej(t.error);
  });
}
const metaGet = (k) => new Promise((res) => {
  const t = db.transaction('meta', 'readonly');
  const r = t.objectStore('meta').get(k);
  r.onsuccess = () => res(r.result ? r.result.value : null);
  r.onerror   = () => res(null);
});
const metaSet = (k, v) => dbPut('meta', { key: k, value: v });

/* ---------- date & week ---------- */
function renderDate() {
  const now = new Date();
  $('#weekDay').textContent  = now.toLocaleDateString('en-US', { weekday: 'long' });
  $('#fullDate').textContent = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/* ---------- falling bubbles ---------- */
function makeBubbles() {
  const wrap = $('#bubbles');
  const colors = [
    'rgba(75,167,202,0.30)', 'rgba(255,182,193,0.40)',
    'rgba(123,192,219,0.28)', 'rgba(255,201,210,0.36)',
    'rgba(255,255,255,0.45)'
  ];
  const n = window.innerWidth < 400 ? 18 : 26;
  for (let i = 0; i < n; i++) {
    const b = document.createElement('div');
    b.className = 'bubble';
    const size = 7 + Math.random() * 34;
    b.style.width = b.style.height = size + 'px';
    b.style.left = (Math.random() * 100) + 'vw';
    b.style.background = `radial-gradient(circle at 30% 28%, rgba(255,255,255,0.95), ${colors[i % colors.length]} 72%)`;
    b.style.animationDuration = (9 + Math.random() * 13) + 's';
    b.style.animationDelay = (-Math.random() * 22) + 's';
    b.style.setProperty('--sway', (Math.random() * 80 - 40) + 'px');
    b.style.setProperty('--op', (0.35 + Math.random() * 0.35).toFixed(2));
    wrap.appendChild(b);
  }
}

/* ============================
   TO DO LIST
   ============================ */
async function addTodo() {
  const input = $('#todoInput');
  const text = input.value.trim();
  if (!text) return;
  await dbPut('todos', { id: uid(), text, done: false, createdAt: Date.now() });
  input.value = '';
  renderTodos();
}
async function renderTodos() {
  const items = (await dbAll('todos')).sort((a, b) => a.createdAt - b.createdAt);
  const list = $('#todoList');
  list.innerHTML = '';
  items.forEach((it) => {
    const li = document.createElement('li');
    li.className = 'list-item' + (it.done ? ' done' : '');
    li.dataset.id = it.id;
    const check = it.done
      ? '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" fill="none" stroke="white" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '';
    li.innerHTML =
      `<button class="check" aria-label="Toggle">${check}</button>` +
      `<span class="list-text">${esc(it.text)}</span>` +
      `<button class="del" aria-label="Delete">×</button>`;
    list.appendChild(li);
  });
  const done = items.filter((i) => i.done).length;
  $('#todoCount').textContent = items.length ? done + '/' + items.length : '';
  $('#todoEmpty').style.display = items.length ? 'none' : 'block';
  $('#todoClear').style.display = done ? 'inline-block' : 'none';
}

/* ============================
   SHOPPING LIST
   ============================ */
async function addShopping() {
  const input = $('#shopInput');
  const text = input.value.trim();
  if (!text) return;
  const qty = Math.max(1, parseInt($('#shopQty').value, 10) || 1);
  await dbPut('shopping', { id: uid(), text, qty, done: false, createdAt: Date.now() });
  input.value = '';
  $('#shopQty').value = 1;
  renderShop();
}
async function renderShop() {
  const items = (await dbAll('shopping')).sort((a, b) => a.createdAt - b.createdAt);
  const list = $('#shopList');
  list.innerHTML = '';
  items.forEach((it) => {
    const li = document.createElement('li');
    li.className = 'list-item' + (it.done ? ' done' : '');
    li.dataset.id = it.id;
    const check = it.done
      ? '<svg viewBox="0 0 24 24"><path d="M5 12l4 4 10-10" fill="none" stroke="white" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      : '';
    li.innerHTML =
      `<button class="check" aria-label="Toggle">${check}</button>` +
      `<span class="list-text">${esc(it.text)}</span>` +
      (it.qty > 1 ? `<span class="qty">×${it.qty}</span>` : '') +
      `<button class="del" aria-label="Delete">×</button>`;
    list.appendChild(li);
  });
  const done = items.filter((i) => i.done).length;
  $('#shopCount').textContent = items.length ? done + '/' + items.length : '';
  $('#shopEmpty').style.display = items.length ? 'none' : 'block';
  $('#shopClear').style.display = done ? 'inline-block' : 'none';
}

/* ============================
   DAILY DIARY / EMOTION
   ============================ */
const MOODS = [
  { e: '😊', l: 'Happy' }, { e: '😌', l: 'Calm' }, { e: '🥰', l: 'Loved' },
  { e: '✨', l: 'Excited' }, { e: '😢', l: 'Sad' }, { e: '😴', l: 'Tired' },
  { e: '🤔', l: 'Puzzled' }, { e: '😐', l: 'Meh' }
];
let currentMood = null;
let currentPhotos = [];
let saveTimer = null;
let autoNoteTimer = null;

function buildMoods() {
  const row = $('#moodRow');
  row.innerHTML = '';
  MOODS.forEach((m) => {
    const b = document.createElement('button');
    b.className = 'mood';
    b.dataset.emoji = m.e;
    b.innerHTML = `<span class="mood-emoji">${m.e}</span><span class="mood-label">${m.l}</span>`;
    b.addEventListener('click', () => {
      currentMood = (currentMood === m.e) ? null : m.e;
      row.querySelectorAll('.mood').forEach((x) => x.classList.remove('sel'));
      if (currentMood) b.classList.add('sel');
      scheduleSave();
    });
    row.appendChild(b);
  });
}

async function loadDiary(date) {
  const entry = await dbGet('diary', date);
  currentMood = entry ? entry.mood : null;
  currentPhotos = entry ? (entry.photos || []).slice() : [];
  $('#diaryText').value = entry ? (entry.content || '') : '';
  $('#diaryDate').value = date;
  document.querySelectorAll('.mood').forEach((x) =>
    x.classList.toggle('sel', x.dataset.emoji === currentMood)
  );
  renderPhotos();
}

function renderPhotos() {
  const p = $('#photoPreview');
  p.innerHTML = '';
  currentPhotos.forEach((src, i) => {
    const d = document.createElement('div');
    d.className = 'thumb';
    d.innerHTML = `<img src="${src}" alt="photo"><button class="thumb-del" data-i="${i}" aria-label="Remove">×</button>`;
    p.appendChild(d);
  });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDiaryEntry, 800);
}

async function saveDiaryEntry() {
  const date = $('#diaryDate').value || todayStr();
  const content = $('#diaryText').value;
  // delete empty entries to keep things tidy
  if (!content.trim() && !currentMood && currentPhotos.length === 0) {
    const existing = await dbGet('diary', date);
    if (existing) { await dbDelete('diary', date); renderEntries(); }
    return;
  }
  const existing = await dbGet('diary', date);
  const entry = {
    id: date,
    date,
    mood: currentMood,
    content,
    photos: currentPhotos,
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now()
  };
  await dbPut('diary', entry);
  renderEntries();
  showAutoNote();
}
function showAutoNote() {
  const n = $('#autoNote');
  n.textContent = '✓ saved';
  clearTimeout(autoNoteTimer);
  autoNoteTimer = setTimeout(() => { n.textContent = ''; }, 1600);
}

async function renderEntries() {
  const all = (await dbAll('diary')).sort((a, b) => b.date.localeCompare(a.date));
  const c = $('#entries');
  c.innerHTML = '';
  all.forEach((en) => {
    const d = document.createElement('div');
    d.className = 'entry';
    const thumbs = (en.photos || []).map((p) => `<img src="${p}" class="entry-thumb" alt="photo">`).join('');
    d.innerHTML =
      `<div class="entry-head">` +
        `<span class="entry-date">${fmtDate(en.date)}</span>` +
        `<span class="entry-mood">${en.mood || ''}</span>` +
        `<button class="entry-del" data-id="${en.id}" aria-label="Delete entry">×</button>` +
      `</div>` +
      `<div class="entry-content">${esc(en.content || '')}</div>` +
      (thumbs ? `<div class="entry-photos">${thumbs}</div>` : '');
    // click head to load into editor
    d.querySelector('.entry-head').addEventListener('click', async (ev) => {
      if (ev.target.closest('.entry-del')) return;
      $('#diaryDate').value = en.date;
      await loadDiary(en.date);
      $('#diaryText').focus();
      $('#diaryCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    d.querySelector('.entry-del').addEventListener('click', async (ev) => {
      ev.stopPropagation();
      await dbDelete('diary', en.id);
      if ($('#diaryDate').value === en.id) await loadDiary(en.id);
      renderEntries();
      toast('Entry deleted');
    });
    c.appendChild(d);
  });
  $('#entriesEmpty').style.display = all.length ? 'none' : 'block';
}

/* ---------- photo file -> compressed data URL ---------- */
function fileToData(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const max = 900;
        let w = img.width, h = img.height;
        if (w > max || h > max) {
          const s = max / Math.max(w, h);
          w = Math.round(w * s); h = Math.round(h * s);
        }
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.72));
      };
      img.onerror = () => resolve(e.target.result);
      img.src = e.target.result;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
}

/* ============================
   BACKUP / RESTORE
   ============================ */
async function exportData() {
  const data = {
    app: 'Listing',
    version: 1,
    exportedAt: new Date().toISOString(),
    todos: await dbAll('todos'),
    shopping: await dbAll('shopping'),
    diary: await dbAll('diary')
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `listing-backup-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
  await metaSet('lastBackup', Date.now());
  checkReminder();
  toast('Backup downloaded 💾');
}

function importData() { $('#importFile').click(); }

async function handleImport(file) {
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); }
  catch { toast('Invalid backup file'); return; }
  if (!data || !Array.isArray(data.todos)) { toast('Invalid backup file'); return; }
  if (!confirm('Restore will replace your current data with the backup. Continue?')) return;
  await dbClear('todos'); await dbClear('shopping'); await dbClear('diary');
  for (const it of data.todos)    await dbPut('todos', it);
  for (const it of (data.shopping || [])) await dbPut('shopping', it);
  for (const it of (data.diary || []))    await dbPut('diary', it);
  await renderTodos();
  await renderShop();
  await renderEntries();
  await loadDiary($('#diaryDate').value);
  toast('Data restored ✓');
}

/* ============================
   BACKUP REMINDER
   ============================ */
async function checkReminder() {
  const last = await metaGet('lastBackup');
  const r = $('#reminder');
  const txt = r.querySelector('.reminder-text');
  const hasData =
    (await dbAll('todos')).length ||
    (await dbAll('shopping')).length ||
    (await dbAll('diary')).length;
  if (!hasData) { r.classList.remove('show'); return; }
  if (!last) {
    txt.textContent = 'Tip: back up your data so you never lose it. 💾';
    r.classList.add('show');
    return;
  }
  const days = (Date.now() - last) / 86400000;
  if (days >= 7) {
    txt.textContent = "It's been a while — back up to stay safe. 🍯";
    r.classList.add('show');
  } else {
    r.classList.remove('show');
  }
}

/* ============================
   PRINT (A4)
   ============================ */
$('#printBtn').addEventListener('click', async () => {
  await saveDiaryEntry();
  // give the render a tick before printing
  setTimeout(() => window.print(), 350);
});

/* ============================
   EVENT WIRING
   ============================ */
// To Do
$('#todoAdd').addEventListener('click', addTodo);
$('#todoInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });
$('#todoList').addEventListener('click', async (e) => {
  const li = e.target.closest('.list-item'); if (!li) return;
  const id = li.dataset.id;
  if (e.target.closest('.check')) {
    const it = await dbGet('todos', id); if (!it) return;
    it.done = !it.done; await dbPut('todos', it); renderTodos();
  } else if (e.target.closest('.del')) {
    await dbDelete('todos', id); renderTodos();
  }
});
$('#todoClear').addEventListener('click', async () => {
  const items = await dbAll('todos');
  for (const it of items) if (it.done) await dbDelete('todos', it.id);
  renderTodos(); toast('Cleared done tasks');
});

// Shopping
$('#shopAdd').addEventListener('click', addShopping);
$('#shopInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') addShopping(); });
$('#shopList').addEventListener('click', async (e) => {
  const li = e.target.closest('.list-item'); if (!li) return;
  const id = li.dataset.id;
  if (e.target.closest('.check')) {
    const it = await dbGet('shopping', id); if (!it) return;
    it.done = !it.done; await dbPut('shopping', it); renderShop();
  } else if (e.target.closest('.del')) {
    await dbDelete('shopping', id); renderShop();
  }
});
$('#shopClear').addEventListener('click', async () => {
  const items = await dbAll('shopping');
  for (const it of items) if (it.done) await dbDelete('shopping', it.id);
  renderShop(); toast('Cleared bought items');
});

// Diary
$('#diaryDate').addEventListener('change', (e) => loadDiary(e.target.value));
$('#diaryText').addEventListener('input', scheduleSave);
$('#diarySave').addEventListener('click', async () => {
  await saveDiaryEntry(); toast('Diary saved 📖');
});

// Photos
$('#photoInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  for (const f of files) {
    const data = await fileToData(f);
    if (data) currentPhotos.push(data);
  }
  e.target.value = '';
  renderPhotos();
  scheduleSave();
});
$('#photoPreview').addEventListener('click', async (e) => {
  const del = e.target.closest('.thumb-del');
  if (del) {
    const i = parseInt(del.dataset.i, 10);
    currentPhotos.splice(i, 1);
    renderPhotos();
    scheduleSave();
  }
});

// Backup / Restore
$('#exportBtn').addEventListener('click', exportData);
$('#importBtn').addEventListener('click', importData);
$('#importFile').addEventListener('change', (e) => {
  const f = e.target.files[0]; handleImport(f); e.target.value = '';
});
$('#reminderBtn').addEventListener('click', exportData);
$('#reminderX').addEventListener('click', async () => {
  $('#reminder').classList.remove('show');
  await metaSet('lastBackup', Date.now()); // snooze
  checkReminder();
});

// Lightbox (any entry/preview photo)
document.addEventListener('click', (e) => {
  const img = e.target.closest('img.entry-thumb') || e.target.closest('.thumb img');
  if (img) {
    const lb = $('#lightbox');
    $('#lightboxImg').src = img.src;
    lb.classList.add('show');
  }
});
$('#lightbox').addEventListener('click', () => $('#lightbox').classList.remove('show'));

/* ============================
   INIT
   ============================ */
(async function init() {
  try {
    await openDB();
  } catch (err) {
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="padding:18px;text-align:center;color:#c00">Could not open local storage. Please allow storage access in your browser.</div>');
    return;
  }

  // ask the browser to keep our data (helps vs accidental clearing on mobile)
  if (navigator.storage && navigator.storage.persist) {
    try { await navigator.storage.persist(); } catch (_) {}
  }

  renderDate();
  makeBubbles();
  buildMoods();

  $('#diaryDate').value = todayStr();
  await loadDiary(todayStr());
  await renderTodos();
  await renderShop();
  await renderEntries();
  checkReminder();

  // refresh the date at midnight
  const msToMidnight = (() => {
    const m = new Date(); m.setHours(24, 0, 0, 0);
    return m - new Date();
  })();
  setTimeout(() => { renderDate(); setInterval(renderDate, 86400000); }, msToMidnight);
})();
