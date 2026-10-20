'use strict';
/* ÖGS-Vokabeltrainer – Vanilla JS, keine Abhängigkeiten. */
const KEY = 'oegs-trainer-v1';
const GAP = 4;                 // "Noch üben": Karte kommt nach ~4 anderen Karten wieder
const DAY = 864e5;
const LEVELS = ['Neu', 'In Übung', 'Gelernt', 'Gefestigt'];
const $ = id => document.getElementById(id);
// Sicherer DOM-Helfer: Text wird immer per textContent gesetzt, nie per innerHTML.
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  e.append(...kids);
  return e;
};
const showView = n => ['select', 'learn', 'done'].forEach(s => { $(s).hidden = s !== n; });

let vocab = [], byId = new Map(), sel = new Set(), query = '', S = null;
const notes = [];
function notice(msg) {
  notes.push(msg);
  $('notice').replaceChildren(...notes.map(m => el('p', { text: m })));
  $('notice').hidden = false;
}

/* ---------- Persistenz (localStorage, mit Validierung) ---------- */
function load() {
  const d = { progress: {}, stats: { rounds: 0 }, selection: [], prefs: { controls: false } };
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { notice('Lokaler Speicher ist nicht verfügbar – Fortschritt wird nicht gespeichert.'); }
  if (raw === null) return d;
  try {
    const r = JSON.parse(raw);
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new Error('format');
    const progress = {};
    for (const [k, v] of Object.entries(r.progress || {}))
      if (v && Number.isInteger(v.level) && v.level >= 0 && v.level <= 3) progress[k] = { level: v.level, last: +v.last || 0 };
    return {
      progress,
      stats: { rounds: +(r.stats && r.stats.rounds) || 0 },
      selection: Array.isArray(r.selection) ? r.selection.filter(x => typeof x === 'string') : [],
      prefs: { controls: !!(r.prefs && r.prefs.controls) }
    };
  } catch (e) {
    notice('Gespeicherte Daten waren beschädigt und wurden zurückgesetzt.');
    return d;
  }
}
const state = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { notice('Fortschritt konnte nicht gespeichert werden (Speicher gesperrt oder voll).'); }
}

/* ---------- Lernstatus ----------
   0 Neu → 1 In Übung → 2 Gelernt → 3 Gefestigt.
   "Gelernt" setzt ein Wort höchstens auf "Gelernt" (2). "Gefestigt" (3) gibt es erst,
   wenn es später (mehr als 24 h danach) erneut als gelernt markiert wird.
   "Noch üben" setzt das Wort zurück auf "In Übung" (1). */
const lvl = id => (state.progress[id] || { level: 0 }).level;
function markLearned(id) {
  const p = state.progress[id] || { level: 0, last: 0 }, now = Date.now();
  if (p.level < 2) p.level = 2;
  else if (p.level === 2 && now - p.last > DAY) p.level = 3;
  p.last = now; state.progress[id] = p; save();
}
function markPractice(id) { state.progress[id] = { level: 1, last: Date.now() }; save(); }

/* ---------- Auswahl ---------- */
const letterOf = m => {
  const c = m.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
};
const persistSel = () => { state.selection = [...sel]; save(); };

function buildLetters() {
  const box = $('letters'); box.replaceChildren();
  for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#') {
    const items = vocab.filter(v => v.letter === L);
    if (L === '#' && !items.length) continue;
    const attrs = {
      type: 'button', class: 'letter', 'data-letter': L, 'aria-pressed': 'false', text: L,
      'aria-label': `Buchstabe ${L}, ${items.length} Vokabeln`,
      onclick: () => {
        const all = items.every(v => sel.has(v.id));
        items.forEach(v => all ? sel.delete(v.id) : sel.add(v.id));
        persistSel(); refresh();
      }
    };
    if (!items.length) attrs.disabled = '';
    box.append(el('button', attrs));
  }
}
const hits = () => vocab.filter(v => v.meaning.toLowerCase().includes(query));
function renderList() {
  const ul = $('list'); ul.replaceChildren();
  const h = hits();
  if (!h.length) ul.append(el('li', { class: 'empty', text: vocab.length ? 'Keine Treffer.' : 'Keine Vokabeln vorhanden.' }));
  for (const v of h) {
    ul.append(el('li', {}, el('label', { class: 'item' },
      el('input', { type: 'checkbox', value: v.id, onchange: e => { e.target.checked ? sel.add(v.id) : sel.delete(v.id); persistSel(); refresh(); } }),
      el('span', { class: 'm', text: v.meaning }),
      el('span', { class: 'c', text: v.category || '' }),
      el('span', { class: 'b', text: LEVELS[lvl(v.id)] }))));
  }
  $('selHits').hidden = !query;
  refresh();
}
function refresh() {
  document.querySelectorAll('#letters button').forEach(b => {
    const items = vocab.filter(v => v.letter === b.dataset.letter);
    b.setAttribute('aria-pressed', String(items.length > 0 && items.every(v => sel.has(v.id))));
  });
  document.querySelectorAll('#list input').forEach(i => { i.checked = sel.has(i.value); });
  $('count').textContent = `${vocab.length} Vokabeln verfügbar · ${sel.size} ausgewählt`;
  const c = [0, 0, 0, 0]; vocab.forEach(v => c[lvl(v.id)]++);
  $('stats').textContent = LEVELS.map((n, i) => `${n}: ${c[i]}`).join(' · ') + ` · Gestartete Runden: ${state.stats.rounds}`;
}

/* ---------- Lernsitzung / Warteschlange ----------
   S.queue   = IDs, vorne = aktuelle Karte
   S.learned = in dieser Runde als gelernt markiert
   S.practice= in dieser Runde mit "Noch üben" markiert (und noch nicht gelernt) */
function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function startSession(ids) {
  if (!ids.length) return;
  state.stats.rounds++; save();
  S = { queue: shuffle(ids), learned: new Set(), practice: new Set(), total: ids.length };
  showView('learn'); showCard();
}
function showCard() {
  const it = byId.get(S.queue[0]);
  $('progress').max = S.total; $('progress').value = S.learned.size;
  $('progText').textContent = `Noch ${S.queue.length} von ${S.total} Karten · gelernt: ${S.learned.size}`;
  $('meaning').hidden = true; $('notes').hidden = true;
  $('meaning').textContent = it.meaning; $('notes').textContent = it.notes || '';
  $('reveal').disabled = false;
  loadVideo(it);
}
function answer(kind) {
  if (!S || !S.queue.length) return;
  if (kind === 'skip') {
    if (S.queue.length < 2) { $('vmsg').replaceChildren(el('p', { text: 'Das ist die letzte Karte – bitte „Gelernt“ oder „Noch üben“ wählen.' })); return; }
    S.queue.push(S.queue.shift());                 // ans Ende, nicht als gelernt markiert
  } else {
    const id = S.queue.shift();
    if (kind === 'learned') { S.learned.add(id); S.practice.delete(id); markLearned(id); }
    else {
      S.practice.add(id); markPractice(id);
      if (!S.queue.length) { finish(); return; }   // einzige Restkarte: keine Endlosschleife
      S.queue.splice(Math.min(GAP, S.queue.length), 0, id); // erst nach einigen anderen Karten
    }
  }
  S.queue.length ? showCard() : finish();
}
function finish() {
  stopVideo();
  S.rem = [...new Set([...S.queue, ...S.practice])].filter(id => !S.learned.has(id));
  $('dLearned').textContent = S.learned.size; $('dRem').textContent = S.rem.length;
  $('repeat').disabled = !S.rem.length;
  showView('done'); $('doneH').focus();
}
const selectedIds = () => vocab.filter(v => sel.has(v.id)).map(v => v.id);

/* ---------- Video ---------- */
function mediaFor(url) {
  let u; try { u = new URL(url); } catch (e) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.replace(/^www\./, ''), p = u.pathname; let m, id = null;
  if (/\.(mp4|webm|m4v|ogv)$/i.test(p)) return { type: 'file', src: u.href };
  if (h === 'youtu.be') id = p.slice(1);
  else if (h.endsWith('youtube.com')) id = u.searchParams.get('v') || ((m = p.match(/^\/(?:embed|shorts)\/([\w-]+)/)) && m[1]);
  if (id && /^[\w-]{6,}$/.test(id))
    return { type: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&mute=1&autoplay=1&loop=1&playlist=${id}` };
  if (h === 'vimeo.com' && (m = p.match(/^\/(\d+)/)))
    return { type: 'iframe', src: `https://player.vimeo.com/video/${m[1]}?muted=1&autoplay=1&loop=1` };
  return { type: 'iframe', src: u.href };   // unbekannter Anbieter: Einbettung versuchen
}
function stopVideo() {
  $('media').querySelectorAll('video').forEach(v => { v.pause(); v.removeAttribute('src'); v.load(); });
  $('media').replaceChildren(); $('vmsg').replaceChildren();
}
const openLink = url => el('p', {}, el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', text: 'Original-Video in neuem Tab öffnen' }));
function loadVideo(it) {
  stopVideo();
  const m = mediaFor(it.videoUrl), msg = $('vmsg');
  const fail = t => msg.replaceChildren(el('p', { text: t }), ...(m ? [openLink(it.videoUrl)] : []));
  $('media').className = 'media' + (m && m.type === 'iframe' ? ' embed' : '');
  if (!m) return fail('Ungültige Video-Adresse.');
  if (m.type === 'file') {
    const v = el('video', { loop: '', playsinline: '', preload: 'auto', 'aria-label': 'Gebärdenvideo' });
    v.muted = true; v.autoplay = true; v.controls = state.prefs.controls;
    v.addEventListener('error', () => { if (v.isConnected) fail('Das Video konnte nicht geladen werden (Adresse falsch, Datei fehlt oder Zugriff gesperrt).'); });
    v.src = m.src; $('media').append(v);
    const p = v.play();
    if (p && p.catch) p.catch(() => { if (v.isConnected && !v.error) msg.replaceChildren(el('p', { text: 'Autoplay wurde vom Browser blockiert. Bitte „Video abspielen“ drücken.' })); });
  } else {
    const f = el('iframe', { title: 'Gebärdenvideo', allow: 'autoplay; fullscreen; picture-in-picture', allowfullscreen: '', referrerpolicy: 'no-referrer', sandbox: 'allow-scripts allow-same-origin allow-presentation' });
    f.src = m.src; $('media').append(f);
    msg.replaceChildren(el('p', { class: 'muted', text: 'Eingebettetes Video. Wird nichts angezeigt, erlaubt der Anbieter keine Einbettung.' }), openLink(it.videoUrl));
  }
}
function replay() {
  const v = $('media').querySelector('video'), f = $('media').querySelector('iframe');
  if (v) { v.currentTime = 0; const p = v.play(); if (p && p.catch) p.catch(() => {}); }
  else if (f) f.src = f.src;
}

/* ---------- Start ---------- */
function resetProgress() {
  state.progress = {}; state.stats.rounds = 0; save(); renderList();
}
function bind() {
  $('search').addEventListener('input', e => { query = e.target.value.trim().toLowerCase(); renderList(); });
  $('selAll').onclick = () => { vocab.forEach(v => sel.add(v.id)); persistSel(); refresh(); };
  $('selHits').onclick = () => { hits().forEach(v => sel.add(v.id)); persistSel(); refresh(); };
  $('selNone').onclick = () => { sel.clear(); persistSel(); refresh(); };
  $('ctrl').checked = state.prefs.controls;
  $('ctrl').onchange = e => { state.prefs.controls = e.target.checked; save(); };
  $('start').onclick = () => {
    if (!sel.size) { $('selMsg').textContent = 'Bitte wähle mindestens eine Vokabel aus.'; return; }
    $('selMsg').textContent = ''; startSession(selectedIds());
  };
  $('reveal').onclick = () => { $('meaning').hidden = false; $('notes').hidden = !S || !byId.get(S.queue[0]).notes; $('reveal').disabled = true; };
  $('practice').onclick = () => answer('practice');
  $('learned').onclick = () => answer('learned');
  $('skip').onclick = () => answer('skip');
  $('replay').onclick = replay;
  $('end').onclick = () => { if (S) finish(); };
  $('repeat').onclick = () => startSession(S.rem);
  $('again').onclick = () => startSession(selectedIds());
  $('back').onclick = () => { renderList(); showView('select'); };
  $('reset').onclick = () => {
    if ($('dlg').showModal) $('dlg').showModal();
    else if (confirm('Fortschritt wirklich zurücksetzen?')) resetProgress();
  };
  $('dlgNo').onclick = () => $('dlg').close();
  $('dlgYes').onclick = () => { $('dlg').close(); resetProgress(); };
}
async function init() {
  bind();
  let data;
  try {
    const r = await fetch('vocabulary.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    data = await r.json();
  } catch (e) {
    notice('vocabulary.json konnte nicht geladen werden.' + (location.protocol === 'file:' ? ' Bitte die Seite über einen lokalen Webserver öffnen (siehe README).' : ' Prüfe Dateiname und JSON-Syntax.'));
    data = [];
  }
  if (!Array.isArray(data)) { notice('vocabulary.json muss eine Liste (Array) sein.'); data = []; }
  const seen = new Set(); let bad = 0;
  for (const v of data) {
    const ok = v && typeof v.id === 'string' && v.id && typeof v.meaning === 'string' && v.meaning.trim() && typeof v.videoUrl === 'string' && !seen.has(v.id);
    if (!ok) { bad++; continue; }
    seen.add(v.id);
    vocab.push({ id: v.id, meaning: v.meaning.trim(), videoUrl: v.videoUrl.trim(), category: typeof v.category === 'string' ? v.category : '', notes: typeof v.notes === 'string' ? v.notes : '', letter: letterOf(v.meaning) });
  }
  if (bad) notice(`${bad} Einträge in vocabulary.json waren unvollständig oder doppelt und wurden ignoriert.`);
  if (!vocab.length) notice('Keine gültigen Vokabeln gefunden.');
  vocab.sort((a, b) => a.meaning.localeCompare(b.meaning, 'de'));
  byId = new Map(vocab.map(v => [v.id, v]));
  sel = new Set(state.selection.filter(id => byId.has(id)));
  buildLetters(); renderList();
}
init();
