'use strict';
/* Sin Pensar: FSI-style drills with spaced review, recorded audio and speech checking. */

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TR = 'Say it in Spanish.';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.8-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z"/></svg>';
const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 14zm6-3.6a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.9V19H8.5a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H13v-2.7a6 6 0 0 0 5-5.9z"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>';
const SPIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 1 1 0 1 0-2 0 7 7 0 1 1-7-7 1 1 0 1 0 0-2z"/></svg>';
const INT = [0, 1, 3, 7, 14, 30, 60];
const NEW_PER_DAY = 10;
const REVIEW_CAP = 25;
const PRON = ['yo', 'tú', 'él', 'ella', 'usted', 'nosotros', 'vosotros', 'ellos', 'ellas', 'ustedes'];

/* ---------- course ---------- */
let U = [];
const CARDS = [];
const BY = {};
let AUDIO = { files: {} };

function buildCards(course) {
  U = course.units;
  U.forEach((u, ui) => {
    const add = (c) => { c.u = ui; CARDS.push(c); BY[c.id] = c; };
    u.dialogue.forEach((l, i) => add({
      id: `${u.id}.d${i}`, kind: 'line', who: l.speaker, es: l.es, en: l.en, alts: [l.es],
      base: '', cue: '', how: TR, label: `Dialogue ${ui + 1}.${i + 1}`,
    }));
    u.drills.forEach((g, gi) => g.items.forEach((it, i) => add({
      id: `${u.id}.g${gi}.${i}`, kind: g.kind, how: g.instruction,
      base: g.kind === 'tr' ? '' : it.base, en: g.kind === 'tr' ? it.en : '', cue: it.cue || '',
      es: it.answers[0], alts: it.answers, label: `${g.type} ${ui + 1}.${gi + 1}.${i + 1}`,
    })));
  });
}

/* ---------- answer checking ---------- */
function today() { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); }
function norm(s) { return String(s).toLowerCase().normalize('NFC').replace(/[¿?¡!.,;:"'()«»]/g, ' ').replace(/\s+/g, ' ').trim(); }
function bare(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function check(card, input) {
  const n = norm(input);
  if (!n) return 'no';
  const c = card.alts.map(norm);
  if (card.cue && PRON.includes(card.cue)) card.alts.forEach((a) => c.push(norm(`${card.cue} ${a}`)));
  if (c.includes(n)) return 'ok';
  if (c.map(bare).includes(bare(n))) return 'accent';
  return 'no';
}
// Speech recognition writes numbers as digits; turn them back into words before comparing.
const NUM = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta'];
const numWord = (n) => { n = +n; return n <= 30 ? NUM[n] : ({ 40: 'cuarenta', 50: 'cincuenta', 60: 'sesenta' })[n] || String(n); };
function spokenToText(s) {
  return String(s)
    .replace(/(\d{1,2})[:.](\d{2})/g, (m, h, mm) => { mm = +mm; return numWord(h) + (mm === 30 ? ' y media' : mm === 15 ? ' y cuarto' : mm === 0 ? '' : ` y ${numWord(mm)}`); })
    .replace(/€/g, ' euros ')
    .replace(/\d+/g, (d) => numWord(d))
    .replace(/\b(la) uno\b/gi, '$1 una');
}
function checkSpoken(card, text) { return check(card, spokenToText(text)) === 'no' ? 'no' : 'ok'; }

/* ---------- state (this device) ---------- */
const KEY = 'sinpensar.v1';
const PASS_KEY = 'sinpensar.passcode';
function clean(r) {
  const s = { cards: {}, streak: 0, last: 0, mode: 'speak', slow: false, newDay: 0, newCount: 0, t: 0 };
  if (!r || typeof r !== 'object') return s;
  if (r.cards && typeof r.cards === 'object') {
    for (const k in r.cards) {
      const c = r.cards[k];
      if (c && typeof c.b === 'number' && typeof c.d === 'number') s.cards[k] = { b: c.b, d: c.d, n: c.n || 0 };
    }
  }
  ['streak', 'last', 'newDay', 'newCount', 't'].forEach((k) => { if (typeof r[k] === 'number') s[k] = r[k]; });
  if (r.mode === 'type') s.mode = 'type';
  s.slow = !!r.slow;
  return s;
}
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} },
};
let S = (() => { try { return clean(JSON.parse(store.get(KEY))); } catch { return clean(null); } })();
let PASS = store.get(PASS_KEY) || '';
function save() { S.t = Date.now(); store.set(KEY, JSON.stringify(S)); }

/* ---------- audio ---------- */
const player = new Audio();
player.preload = 'auto';
let queue = [];
const warmed = new Set();
let esVoice = null;
const audioFile = (t) => (t && AUDIO.files && AUDIO.files[t]) || null;

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices();
  esVoice = vs.find((v) => /^es[-_]ES/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)) || null;
}
function stopAll() {
  try { player.pause(); } catch {}
  try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch {}
}
function playNext() { if (queue.length) setTimeout(() => playNow(queue.shift()), 350); }
player.addEventListener('ended', playNext);
function playNow(t) {
  const f = audioFile(t);
  const rate = S.slow ? 0.75 : 1;
  if (f) {
    player.src = `/audio/${f}`;
    player.defaultPlaybackRate = rate;
    player.playbackRate = rate;
    const p = player.play();
    if (p) p.catch(() => {});
    return;
  }
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'es-ES';
    if (esVoice) u.voice = esVoice;
    u.rate = S.slow ? 0.7 : 0.95;
    u.onend = playNext;
    speechSynthesis.speak(u);
  } catch {}
}
function say(t) { if (!t) return; queue = []; stopAll(); playNow(t); }
function sayAll(list) { if (!list.length) return; queue = list.slice(1); stopAll(); playNow(list[0]); }
function warm(c) {
  if (!c) return;
  [c.base, c.es].forEach((t) => {
    const f = audioFile(t);
    if (f && !warmed.has(f)) { warmed.add(f); fetch(`/audio/${f}`).catch(() => {}); }
  });
}

/* ---------- recording and speech checking ---------- */
let rec = null;
let recTimer = 0;
let micBlocked = false;
let passErr = '';
const micSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
const speechOn = () => S.mode === 'speak' && !!PASS && micSupported() && !micBlocked;
function speechWhy() {
  if (S.mode !== 'speak') return '';
  if (!micSupported()) return 'This browser cannot record audio, so grade yourself.';
  if (micBlocked) return 'Microphone access is blocked, so grade yourself. Allow the microphone for this site in your browser settings to turn checking back on.';
  if (!PASS) return 'Add your passcode on the Today screen to have your answers checked.';
  return '';
}
async function startRec() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    micBlocked = true;
    render();
    return;
  }
  stopAll();
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/aac'].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  let chunks = [];
  try {
    rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    micBlocked = true;
    render();
    return;
  }
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type: (rec && rec.mimeType) || type || 'audio/mp4' });
    rec = null;
    transcribe(blob);
  };
  rec.start();
  sess.phase = 'rec';
  sess.micErr = '';
  render();
  recTimer = setTimeout(stopRec, 10000);
}
function stopRec() { clearTimeout(recTimer); if (rec && rec.state !== 'inactive') rec.stop(); }
async function transcribe(blob) {
  if (!sess || sess.end) return;
  sess.phase = 'busy';
  render();
  const id = cur().id;
  try {
    const r = await fetch('/api/stt', {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'application/octet-stream', 'x-passcode': PASS },
      body: blob,
    });
    if (!sess || sess.end || cur().id !== id) return;
    if (r.status === 401) {
      PASS = ''; store.set(PASS_KEY, null);
      sess.phase = null;
      sess.micErr = 'The passcode was not accepted. Enter it again on the Today screen.';
      render();
      return;
    }
    if (r.status === 400) { sess.phase = null; sess.micErr = 'That recording was too short. Tap and speak again.'; render(); return; }
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    sess.heard = j.text || '';
    sess.res = sess.heard ? checkSpoken(BY[id], sess.heard) : 'no';
    sess.shown = true;
    sess.phase = null;
    render();
    auto();
  } catch {
    if (!sess || sess.end) return;
    sess.phase = null;
    sess.micErr = 'Speech checking could not reach the server. Try again, or show the answer and grade yourself.';
    render();
  }
}
async function savePasscode(v) {
  passErr = '';
  try {
    const r = await fetch('/api/stt', { headers: { 'x-passcode': v } });
    if (r.status === 204) { PASS = v; store.set(PASS_KEY, v); micBlocked = false; }
    else if (r.status === 401) passErr = 'That passcode does not match the one set in Vercel.';
    else passErr = `The server answered with an error (${r.status}). Check the Vercel deployment.`;
  } catch {
    passErr = 'Could not reach the server. Check your connection and try again.';
  }
  render();
}

/* ---------- session ---------- */
let tab = 'today';
let sess = null;
let confirmReset = false;
function allowance() { return Math.max(0, NEW_PER_DAY - (S.newDay === today() ? S.newCount : 0)); }
function plan(nNew) {
  const t = today();
  const due = CARDS.filter((c) => S.cards[c.id] && S.cards[c.id].d <= t)
    .sort((a, b) => S.cards[a.id].d - S.cards[b.id].d).slice(0, REVIEW_CAP);
  const fresh = CARDS.filter((c) => !S.cards[c.id]).slice(0, nNew);
  return { due, fresh };
}
function start(nNew) {
  const p = plan(nNew);
  if (!p.due.length && !p.fresh.length) return;
  const q = p.due.map((c) => ({ id: c.id, phase: 'test' }))
    .concat(p.fresh.map((c) => ({ id: c.id, phase: c.kind === 'line' ? 'learn' : 'test' })));
  sess = { q, i: 0, total: q.length, done: new Set(), missed: new Set(), rev: p.due.length, neu: p.fresh.length };
  resetCard();
  render();
  auto();
}
function resetCard() { Object.assign(sess, { shown: false, res: null, typed: '', heard: null, phase: null, micErr: '' }); }
function cur() { return sess.q[sess.i]; }
function countNew() { const t = today(); if (S.newDay !== t) { S.newDay = t; S.newCount = 0; } S.newCount++; }
function touchDay() { const t = today(); if (S.last !== t) { S.streak = S.last === t - 1 ? S.streak + 1 : 1; S.last = t; } }
function advance() {
  sess.i++;
  resetCard();
  if (sess.i >= sess.q.length) sess.end = true;
  render();
  auto();
}
function learned() {
  const id = cur().id;
  if (!S.cards[id]) { S.cards[id] = { b: 0, d: today(), n: 0 }; countNew(); }
  sess.q.splice(Math.min(sess.q.length, sess.i + 4), 0, { id, phase: 'test' }); // test 3 cards later
  touchDay(); save(); advance();
}
function grade(g) {
  const id = cur().id;
  const t = today();
  let c = S.cards[id];
  if (!c) { c = { b: 0, d: t, n: 0 }; countNew(); }
  c.n++;
  if (g === 'miss') {
    c.b = 0; c.d = t; sess.missed.add(id);
    sess.q.splice(Math.min(sess.q.length, sess.i + 5), 0, { id, phase: 'test' }); // back 4 cards later
  } else {
    if (g === 'slow') { c.b = Math.max(1, c.b); c.d = t + 1; }
    else { c.b = Math.min(c.b + 1, 6); c.d = t + INT[c.b]; }
    sess.done.add(id);
  }
  S.cards[id] = c;
  touchDay(); save(); advance();
}
function auto() {
  if (!sess || sess.end) return;
  const st = cur();
  const c = BY[st.id];
  if (st.phase === 'learn' || sess.shown) say(c.es); else if (c.base) say(c.base);
  const nx = sess.q[sess.i + 1];
  if (nx) warm(BY[nx.id]);
}

/* ---------- views ---------- */
function seg(name, opts, val) {
  return `<div class="seg" role="group">${opts.map((o) => `<button data-act="set" data-k="${name}" data-v="${o[0]}" aria-pressed="${String(val) === o[0]}">${o[1]}</button>`).join('')}</div>`;
}
function options() {
  return `<div class="opts"><div class="opt"><span class="lbl">Answer by</span>${seg('mode', [['speak', 'Speaking'], ['type', 'Typing']], S.mode)}</div>`
    + `<div class="opt"><span class="lbl">Voice speed</span>${seg('slow', [['false', 'Normal'], ['true', 'Slow']], S.slow)}</div></div>`;
}
function vSpeech() {
  if (S.mode !== 'speak') return '';
  if (!micSupported()) return '<p class="muted small">This browser cannot record audio, so you will grade yourself.</p>';
  if (PASS) return `<p class="muted small">Speech checking is on.${micBlocked ? ' The microphone is blocked right now.' : ''} <button class="btn link inline" data-act="forget">Remove passcode</button></p>`;
  return `<form id="pf" class="pass" autocomplete="off"><label class="lbl" for="pass">Passcode for speech checking</label>`
    + `<div class="row"><input type="password" id="pass" autocomplete="current-password"><button class="btn ghost" type="submit">Turn on</button></div>`
    + `${passErr ? `<p class="err">${esc(passErr)}</p>` : '<p class="muted small">Without it, you say the answer aloud and grade yourself.</p>'}</form>`;
}
function vHome() {
  const p = plan(allowance());
  const n = p.due.length + p.fresh.length;
  const left = CARDS.filter((c) => !S.cards[c.id]).length;
  const mins = Math.max(1, Math.round((p.due.length * 15 + p.fresh.length * 40) / 60));
  let h = '<section class="sheet"><p class="lbl">Today</p>';
  if (n) {
    h += `<h1>${p.due.length ? 'Review, then new material' : 'Start with the next dialogue'}</h1>`
      + `<div class="stats"><div><b>${p.due.length}</b><span>reviews due</span></div><div><b>${p.fresh.length}</b><span>new items</span></div><div><b>${mins}</b><span>minutes, roughly</span></div></div>`
      + options() + vSpeech() + '<button class="btn wide" data-act="start" data-primary>Start session</button>';
  } else {
    h += `<h1>Nothing is due right now</h1><p class="muted">${left ? "You have done today's new items. Reviews come back tomorrow." : 'You have learned every item in the course. Reviews keep coming back on schedule.'}</p>`
      + options() + vSpeech() + (left ? '<button class="btn ghost wide" data-act="more">Add 5 more new items</button>' : '');
  }
  h += `<p class="muted">Streak: ${S.streak}${S.streak === 1 ? ' day' : ' days'} · ${Object.keys(S.cards).length} of ${CARDS.length} items started</p></section>`;
  h += '<details><summary>How this works</summary><div class="dbody"><ul>'
    + '<li>The method comes from the US Foreign Service Institute courses: memorise a short dialogue, then drill its patterns until the answer comes out without thinking.</li>'
    + '<li>In Speaking mode, tap the button, say your answer and tap again. The app transcribes what you said and checks it. It checks the words, not your accent.</li>'
    + '<li>Typing mode checks your answer and flags missing accents.</li>'
    + `<li>A missed item comes back in the same session. A correct one returns after 1, 3, 7, 14, 30 and 60 days. Each day brings up to ${NEW_PER_DAY} new items plus whatever is due.</li></ul></div></details>`;
  return h;
}
function vSession() {
  const st = cur();
  const c = BY[st.id];
  const u = U[c.u];
  let h = `<div class="bar"><i style="width:${Math.round((sess.done.size / sess.total) * 100)}%"></i></div>`
    + `<div class="meta"><span>${esc(c.label)} · ${esc(u.title)}</span><span>${sess.done.size} / ${sess.total}</span></div><section class="sheet">`;
  if (st.phase === 'learn') {
    h += `<p class="how">New line. Listen, then say it aloud three times.</p><p class="who">${esc(c.who)}</p><p class="es">${esc(c.es)}</p><p class="en">${esc(c.en)}</p>`
      + `<div class="row"><button class="btn ghost" data-act="say" data-t="${esc(c.es)}">${PLAY} Listen</button><button class="btn" data-act="learned" data-primary>I said it three times</button></div>`;
  } else {
    h += `<p class="how">${esc(c.kind === 'line' ? TR : c.how)}</p>`;
    if (c.base) {
      h += `<p class="es">${esc(c.base)} <button class="play" data-act="say" data-t="${esc(c.base)}" aria-label="Play the sentence">${PLAY}</button></p>`;
      if (c.cue) h += `<p class="cue"><span>${esc(c.cue)}</span></p>`;
    } else {
      h += `<p class="enq">${esc(c.en)}</p>`;
    }
    if (!sess.shown) {
      if (S.mode === 'type') {
        h += '<form id="f" autocomplete="off"><input type="text" id="ans" aria-label="Your answer in Spanish" autocapitalize="off" autocorrect="off" spellcheck="false" lang="es">'
          + `<div class="keys">${['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'].map((k) => `<button type="button" data-act="key" data-t="${k}">${k}</button>`).join('')}</div>`
          + '<div class="row"><button class="btn" type="submit">Check</button><button class="btn link" type="button" data-act="reveal">I do not know</button></div></form>';
      } else if (speechOn()) {
        const ph = sess.phase;
        h += '<div class="mic-wrap">'
          + (ph === 'busy'
            ? `<button class="mic busy" disabled aria-label="Checking your answer">${SPIN}</button><p class="mic-label muted">Checking…</p>`
            : `<button class="mic${ph === 'rec' ? ' rec' : ''}" data-act="mic" data-primary aria-label="${ph === 'rec' ? 'Stop recording' : 'Record your answer'}">${ph === 'rec' ? STOP : MIC}</button><p class="mic-label">${ph === 'rec' ? 'Listening… tap to stop' : 'Tap and say your answer'}</p>`)
          + '</div>';
        if (sess.micErr) h += `<p class="err">${esc(sess.micErr)}</p>`;
        if (!sess.phase) h += '<div class="row" style="justify-content:center"><button class="btn link" data-act="reveal">Show answer instead</button></div>';
      } else {
        const why = sess.micErr || speechWhy();
        h += `<p class="hint">Say your answer out loud first.</p>${why ? `<p class="muted small">${esc(why)}</p>` : ''}<button class="btn wide" data-act="reveal" data-primary>Show answer</button>`;
      }
    } else {
      h += '<div class="answer">';
      if (sess.res) {
        const v = { ok: 'Correct.', accent: 'Right words. Check the accents.', no: 'Not yet.' }[sess.res];
        h += `<p class="verdict v-${sess.res}">${v}</p>`;
        if (sess.heard !== null) h += `<p class="muted">You said: ${sess.heard ? esc(sess.heard) : '(nothing was heard)'}</p>`;
        else if (sess.res !== 'ok' && sess.typed) h += `<p class="muted">You wrote: ${esc(sess.typed)}</p>`;
      }
      h += `<p class="es">${esc(c.es)} <button class="play" data-act="say" data-t="${esc(c.es)}" aria-label="Play the answer">${PLAY}</button></p>`;
      if (c.kind === 'line') h += `<p class="who">${esc(c.who)}</p>`;
      h += '</div>';
      if (sess.res === 'ok' || sess.res === 'accent') h += '<button class="btn wide" data-act="grade" data-g="good" data-primary>Next</button>';
      else if (sess.res === 'no') h += '<div class="row"><button class="btn" data-act="grade" data-g="miss" data-primary>Next</button><button class="btn link" data-act="grade" data-g="good">Count it as correct</button></div>';
      else h += '<div class="grades"><button class="g-miss" data-act="grade" data-g="miss">Missed<small>again today</small></button><button class="g-slow" data-act="grade" data-g="slow">Slow<small>tomorrow</small></button><button class="g-good" data-act="grade" data-g="good">Automatic<small>later</small></button></div>';
    }
  }
  h += '</section><div class="row"><button class="btn link" data-act="quit">End session</button></div>';
  return h;
}
function vEnd() {
  const left = CARDS.filter((c) => !S.cards[c.id]).length;
  const t = today();
  const tom = CARDS.filter((c) => S.cards[c.id] && S.cards[c.id].d <= t + 1).length;
  return '<section class="sheet"><p class="lbl">Session complete</p><h1>Hecho. Hasta mañana.</h1>'
    + `<div class="stats"><div><b>${sess.rev}</b><span>reviews</span></div><div><b>${sess.neu}</b><span>new items</span></div><div><b>${sess.missed.size}</b><span>needed a repeat</span></div></div>`
    + `<p class="muted">${tom} items will be due by tomorrow. Streak: ${S.streak}${S.streak === 1 ? ' day' : ' days'}.</p>`
    + `<div class="row"><button class="btn" data-act="home" data-primary>Done</button>${left ? '<button class="btn ghost" data-act="more">Add 5 more new items</button>' : ''}</div></section>`;
}
function vCourse() {
  let h = '';
  U.forEach((u, ui) => {
    const cs = CARDS.filter((c) => c.u === ui);
    const seen = cs.filter((c) => S.cards[c.id]).length;
    h += `<details${ui === 0 ? ' open' : ''}><summary><span>Unit ${ui + 1} · ${esc(u.title)} <span class="muted" style="font-weight:400">${esc(u.en)}</span></span><small>${seen} / ${cs.length} started</small></summary><div class="dbody">`
      + `<div class="row"><button class="btn ghost" data-act="dlg" data-u="${ui}">${PLAY} Play the dialogue</button></div><ol class="dlg">`
      + u.dialogue.map((l) => `<li><button class="play" data-act="say" data-t="${esc(l.es)}" aria-label="Play this line">${PLAY}</button><div><p class="who">${esc(l.speaker)}</p><p class="l-es">${esc(l.es)}</p><p class="l-en">${esc(l.en)}</p></div></li>`).join('')
      + `</ol><p class="note">${u.noteHtml}</p></div></details>`;
  });
  h += `<div class="row">${confirmReset
    ? '<span class="muted">Erase all progress on this device?</span><button class="btn" data-act="reset">Erase</button><button class="btn ghost" data-act="noreset">Cancel</button>'
    : '<button class="btn link" data-act="askreset">Reset progress</button>'}</div>`;
  return h;
}
function render() {
  $('#tab-today').setAttribute('aria-current', tab === 'today' ? 'page' : 'false');
  $('#tab-course').setAttribute('aria-current', tab === 'course' ? 'page' : 'false');
  $('#view').innerHTML = tab === 'course' ? vCourse() : !sess ? vHome() : sess.end ? vEnd() : vSession();
  const f = $('#ans') || $('[data-primary]');
  if (f && sess && tab === 'today') { try { f.focus({ preventScroll: true }); } catch {} }
}

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const tb = e.target.closest('[data-tab]');
  if (tb) { tab = tb.dataset.tab; confirmReset = false; render(); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  if (a === 'start') start(allowance());
  else if (a === 'more') start(5);
  else if (a === 'say') say(b.dataset.t);
  else if (a === 'dlg') sayAll(U[+b.dataset.u].dialogue.map((l) => l.es));
  else if (a === 'learned') learned();
  else if (a === 'mic') { if (sess.phase === 'rec') stopRec(); else if (!sess.phase) startRec(); }
  else if (a === 'reveal') { sess.shown = true; sess.res = S.mode === 'type' ? 'no' : null; sess.typed = ''; render(); auto(); }
  else if (a === 'grade') grade(b.dataset.g);
  else if (a === 'quit' || a === 'home') { stopRec(); sess = null; render(); }
  else if (a === 'set') { if (b.dataset.k === 'mode') S.mode = b.dataset.v; else S.slow = b.dataset.v === 'true'; save(); render(); }
  else if (a === 'forget') { PASS = ''; store.set(PASS_KEY, null); render(); }
  else if (a === 'key') {
    const i = $('#ans');
    if (i) {
      const s = i.selectionStart ?? i.value.length;
      const x = i.selectionEnd ?? s;
      i.value = i.value.slice(0, s) + b.dataset.t + i.value.slice(x);
      i.focus();
      i.setSelectionRange(s + 1, s + 1);
    }
  }
  else if (a === 'askreset') { confirmReset = true; render(); }
  else if (a === 'noreset') { confirmReset = false; render(); }
  else if (a === 'reset') { S = clean({ mode: S.mode, slow: S.slow }); sess = null; confirmReset = false; save(); render(); }
});
document.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'pf') { const v = ($('#pass').value || '').trim(); if (v) savePasscode(v); return; }
  if (!sess || sess.end) return;
  const i = $('#ans');
  if (!i || !i.value.trim()) return;
  sess.typed = i.value.trim();
  sess.heard = null;
  sess.res = check(BY[cur().id], sess.typed);
  sess.shown = true;
  render();
  auto();
});
document.addEventListener('keydown', (e) => {
  if (!sess || sess.end || tab !== 'today' || !sess.shown || sess.res || cur().phase === 'learn') return;
  const g = { 1: 'miss', 2: 'slow', 3: 'good' }[e.key];
  if (g) { e.preventDefault(); grade(g); }
});

/* ---------- boot ---------- */
(async function boot() {
  try {
    const [course, manifest] = await Promise.all([
      fetch('/course.json', { cache: 'no-cache' }).then((r) => r.json()),
      fetch('/audio/manifest.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : { files: {} })).catch(() => ({ files: {} })),
    ]);
    buildCards(course);
    AUDIO = manifest && manifest.files ? manifest : { files: {} };
  } catch {
    $('#view').innerHTML = '<section class="sheet"><p class="err">The course could not be loaded. Check your connection and reload.</p></section>';
    return;
  }
  if (!Object.keys(AUDIO.files).length) $('#audio-note').textContent = 'Recorded audio is not ready yet, so the device voice is used for now.';
  pickVoice();
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = pickVoice;
  render();
})();
