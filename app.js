// MicCheck — arhivă locală de povești (IndexedDB, fără server)

const DB_NAME = 'miccheck';
const STORE = 'stories';

const $ = (sel) => document.querySelector(sel);
const list = $('#list');
const search = $('#search');
const editor = $('#editor');
const form = $('#editorForm');
const fields = form.elements;
const player = $('#player');
const recorder = $('#recorder');

let db;
let stories = [];
let current = null; // povestea deschisă în editor
let playerUrl = null;

/* ---------- IndexedDB ---------- */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const dbAll = () => tx('readonly', (s) => s.getAll());
const dbPut = (item) => tx('readwrite', (s) => s.put(item));
const dbDelete = (id) => tx('readwrite', (s) => s.delete(id));

/* ---------- Utilitare ---------- */

const normalize = (s = '') =>
  s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const uid = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function formatDuration(sec) {
  if (!sec) return '';
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

const dateFmt = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });

function toDateInput(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fromDateInput(value, fallback) {
  if (!value) return fallback;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

function formatBytes(b) {
  if (b < 1024 * 1024) return `${Math.max(1, Math.round(b / 1024))} KB`;
  if (b < 1024 ** 3) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 ** 3).toFixed(2)} GB`;
}

function extensionFor(mime = '', fileName = '') {
  const fromName = fileName.match(/\.([a-z0-9]{2,4})$/i)?.[1];
  if (fromName) return fromName.toLowerCase();
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('mpeg')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('caf')) return 'caf';
  if (mime.includes('ogg')) return 'ogg';
  return 'm4a';
}

function titleFromFileName(name) {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base || 'Poveste nouă';
}

function readDuration(blob) {
  return new Promise((resolve) => {
    const audio = new Audio();
    const url = URL.createObjectURL(blob);
    let finished = false;
    const done = (d) => {
      if (finished) return;
      finished = true;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(d) ? d : 0);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      if (audio.duration === Infinity) {
        // unele fișiere webm nu au durata în antet
        audio.ontimeupdate = () => done(audio.duration);
        audio.currentTime = 1e101;
      } else {
        done(audio.duration);
      }
    };
    audio.onerror = () => done(0);
    setTimeout(() => done(0), 8000);
    audio.src = url;
  });
}

/* ---------- Listă ---------- */

function card(story) {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.className = 'card';
  btn.type = 'button';
  btn.addEventListener('click', () => openEditor(story));

  const badge = document.createElement('div');
  badge.className = 'card-badge';
  badge.textContent = (story.narrator || story.title || '?').trim().charAt(0).toUpperCase() || '?';

  const body = document.createElement('div');
  body.className = 'card-body';

  const title = document.createElement('p');
  title.className = 'card-title';
  title.textContent = story.title;

  const meta = document.createElement('p');
  meta.className = 'card-meta';
  meta.textContent = [story.narrator, dateFmt.format(story.createdAt), formatDuration(story.duration)]
    .filter(Boolean)
    .join(' · ');

  body.append(title, meta);

  if (story.notes) {
    const notes = document.createElement('p');
    notes.className = 'card-notes';
    notes.textContent = story.notes;
    body.append(notes);
  }

  btn.append(badge, body);
  li.append(btn);
  return li;
}

function render() {
  const q = normalize(search.value.trim());
  const items = stories
    .filter((s) => !q || normalize(`${s.title} ${s.narrator} ${s.notes}`).includes(q))
    .sort((a, b) => b.createdAt - a.createdAt || b.addedAt - a.addedAt);

  list.replaceChildren(...items.map(card));
  $('#empty').hidden = stories.length > 0;
  $('#noResults').hidden = !(stories.length && !items.length);

  const total = stories.reduce((sum, s) => sum + (s.duration || 0), 0);
  $('#count').textContent = stories.length
    ? `${stories.length} ${stories.length === 1 ? 'poveste' : 'povești'} · ${formatDuration(total)}`
    : 'Arhiva de povești';

  const narrators = [...new Set(stories.map((s) => s.narrator).filter(Boolean))];
  $('#narrators').replaceChildren(
    ...narrators.map((n) => Object.assign(document.createElement('option'), { value: n }))
  );

  updateStorage();
}

async function updateStorage() {
  if (!navigator.storage?.estimate) return;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  $('#storage').textContent = stories.length && quota
    ? `Spațiu folosit: ${formatBytes(usage)} din ${formatBytes(quota)}`
    : '';
}

async function reload() {
  stories = await dbAll();
  render();
}

/* ---------- Editor ---------- */

function openEditor(story, isNew = false) {
  current = story;
  $('#editorTitle').textContent = isNew ? 'Poveste nouă' : 'Poveste';
  form.title.value = story.title;
  form.narrator.value = story.narrator || '';
  form.date.value = toDateInput(story.createdAt);
  form.notes.value = story.notes || '';
  $('#deleteBtn').hidden = false;

  const size = story.blob?.size ? formatBytes(story.blob.size) : '';
  $('#fileInfo').textContent = [story.fileName, size, formatDuration(story.duration)].filter(Boolean).join(' · ');

  if (playerUrl) URL.revokeObjectURL(playerUrl);
  playerUrl = URL.createObjectURL(story.blob);
  player.src = playerUrl;
  setSpeed(1);

  editor.showModal();
}

function closeEditor() {
  player.pause();
  if (editor.open) editor.close();
}

editor.addEventListener('close', () => {
  player.pause();
  player.removeAttribute('src');
  player.load();
  if (playerUrl) URL.revokeObjectURL(playerUrl);
  playerUrl = null;
  current = null;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!current) return;
  const updated = {
    ...current,
    title: form.title.value.trim() || 'Fără titlu',
    narrator: form.narrator.value.trim(),
    createdAt: fromDateInput(form.date.value, current.createdAt),
    notes: form.notes.value.trim(),
  };
  await dbPut(updated);
  closeEditor();
  await reload();
});

function setSpeed(rate) {
  player.playbackRate = rate;
  document.querySelectorAll('[data-speed]').forEach((b) => {
    b.classList.toggle('on', Number(b.dataset.speed) === rate);
  });
}

document.querySelectorAll('[data-speed]').forEach((b) => {
  b.addEventListener('click', () => setSpeed(Number(b.dataset.speed)));
});

$('#deleteBtn').addEventListener('click', async () => {
  if (!current) return;
  if (!confirm(`Ștergi „${current.title}”? Nu se poate anula.`)) return;
  await dbDelete(current.id);
  closeEditor();
  await reload();
});

$('#shareBtn').addEventListener('click', async () => {
  if (!current) return;
  const title = form.title.value.trim() || current.title;
  const safe = title.replace(/[\\/:*?"<>|]+/g, '').slice(0, 80) || 'poveste';
  const name = `${safe}.${extensionFor(current.mime, current.fileName)}`;
  const file = new File([current.blob], name, { type: current.mime || current.blob.type });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
});

/* ---------- Import ---------- */

async function addStory(blob, { fileName = '', title, createdAt = Date.now() } = {}) {
  const story = {
    id: uid(),
    title: title || titleFromFileName(fileName),
    narrator: '',
    notes: '',
    createdAt,
    addedAt: Date.now(),
    duration: await readDuration(blob),
    mime: blob.type,
    fileName,
    blob,
  };
  await dbPut(story);
  return story;
}

$('#fileInput').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  if (!files.length) return;

  const added = [];
  for (const file of files) {
    try {
      added.push(await addStory(file, { fileName: file.name, createdAt: file.lastModified || Date.now() }));
    } catch (err) {
      alert(`Nu am putut importa ${file.name}: ${err.message}`);
    }
  }
  await reload();
  if (added.length === 1) openEditor(added[0], true);
});

/* ---------- Înregistrare directă ---------- */

let mediaRecorder = null;
let chunks = [];
let recStart = 0;
let recTimer = null;
let wakeLock = null;
let discard = false;

function pickMime() {
  const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
  return types.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}

$('#recordBtn').addEventListener('click', async () => {
  if (!window.MediaRecorder) {
    alert('Browserul nu suportă înregistrarea audio.');
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch {
    alert('Am nevoie de acces la microfon. Verifică Setări → Safari → Microfon.');
    return;
  }

  const mimeType = pickMime();
  mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  chunks = [];
  discard = false;

  mediaRecorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    clearInterval(recTimer);
    wakeLock?.release().catch(() => {});
    wakeLock = null;
    if (recorder.open) recorder.close();
    if (discard || !chunks.length) return;

    const blob = new Blob(chunks, { type: mediaRecorder.mimeType || mimeType || 'audio/mp4' });
    const when = new Date();
    const story = await addStory(blob, {
      title: `Poveste ${dateFmt.format(when)}`,
      fileName: `inregistrare-${toDateInput(when.getTime())}.${extensionFor(blob.type)}`,
    });
    await reload();
    openEditor(story, true);
  };

  mediaRecorder.start(1000);
  recStart = Date.now();
  $('#recTime').textContent = '00:00';
  recTimer = setInterval(() => {
    const s = Math.floor((Date.now() - recStart) / 1000);
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    $('#recTime').textContent = h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  }, 500);

  try {
    wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    wakeLock = null;
  }

  recorder.showModal();
});

$('#recStop').addEventListener('click', () => mediaRecorder?.state !== 'inactive' && mediaRecorder.stop());

$('#recCancel').addEventListener('click', () => {
  if (chunks.length && !confirm('Renunți la înregistrare?')) return;
  discard = true;
  mediaRecorder?.state !== 'inactive' ? mediaRecorder.stop() : recorder.close();
});

// Escape nu trebuie să închidă înregistrarea fără să o oprească
recorder.addEventListener('cancel', (e) => e.preventDefault());

/* ---------- Ajutor & închideri ---------- */

const help = $('#help');
$('#helpBtn').addEventListener('click', () => help.showModal());
document.querySelectorAll('[data-open-help]').forEach((b) => b.addEventListener('click', () => help.showModal()));
document.querySelectorAll('[data-close]').forEach((b) =>
  b.addEventListener('click', () => b.closest('dialog').close())
);

// tap pe fundal închide editorul / ajutorul
[editor, help].forEach((d) =>
  d.addEventListener('click', (e) => {
    if (e.target === d) d.close();
  })
);

search.addEventListener('input', render);

/* ---------- Pornire ---------- */

(async () => {
  db = await openDB();
  navigator.storage?.persist?.().catch(() => {});
  await reload();
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
