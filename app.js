'use strict';
/* Autopilot: FSI-style drills in any language, with spaced review, recorded audio and speech checking. */

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.86l11.8-7.2a1 1 0 0 0 0-1.72L8.5 3.94A1 1 0 0 0 7 4.8z"/></svg>';
const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 14zm6-3.6a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.9V19H8.5a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H13v-2.7a6 6 0 0 0 5-5.9z"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>';
const SPIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9 1 1 0 1 0-2 0 7 7 0 1 1-7-7 1 1 0 1 0 0-2z"/></svg>';
const CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 9.4a1 1 0 0 1 1.4 0L12 12.6l3.2-3.2a1 1 0 1 1 1.4 1.4l-3.9 3.9a1 1 0 0 1-1.4 0L7.4 10.8a1 1 0 0 1 0-1.4z"/></svg>';
const INT = [0, 1, 3, 7, 14, 30, 60];
const REVIEW_CAP = 25;
// Speed grading: a correct spoken answer counts as automatic only if you start talking within this time.
const FAST_AUDIO = 2500;    // ms after a spoken prompt (substitution and transformation drills) finishes
const FAST_READ = 3500;     // ms after an English prompt appears, which you have to read first
const TAP_ALLOWANCE = 1000; // extra ms when you tap the mic yourself instead of using hands-free
const REPO = 'https://github.com/patrickcapstick-web/spanish_tutor';

/* ---------- storage ---------- */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch {} },
};
const PASS_KEY = 'sinpensar.passcode';
const COURSE_KEY = 'sinpensar.course';
const stateKey = (id) => (id === 'es' ? 'sinpensar.v1' : `sinpensar.${id}.v1`); // Spanish keeps its original key

/* ---------- course ---------- */
let INDEX = [];
let C = null;            // the course being studied
let U = [];
let CARDS = [];
let BY = {};
let AUDIO = { files: {} };

function buildCards(course) {
  C = course;
  U = course.units;
  CARDS = [];
  BY = {};
  U.forEach((u, ui) => {
    const add = (c) => { c.u = ui; CARDS.push(c); BY[c.id] = c; };
    u.dialogue.forEach((l, i) => add({
      id: `${u.id}.d${i}`, kind: 'line', who: l.speaker, target: l.target, rom: l.rom || '', en: l.en, alts: [l.target], kana: l.kana || null,
      base: '', cue: '', how: C.sayIt, label: `Dialogue ${ui + 1}.${i + 1}`,
    }));
    u.drills.forEach((g, gi) => g.items.forEach((it, i) => add({
      id: `${u.id}.g${gi}.${i}`, kind: g.kind, how: g.instruction,
      base: g.kind === 'tr' ? '' : it.base, baseRom: it.baseRom || '', baseEn: it.baseEn || '',
      en: g.kind === 'tr' ? it.en : '', cue: it.cue || '', cueRom: it.cueRom || '', cueEn: it.cueEn || '',
      target: it.answers[0], rom: it.answerRom || '', alts: it.answers, kana: it.kana || null, label: `${g.type} ${ui + 1}.${gi + 1}.${i + 1}`,
    })));
  });
}

/* Variant tokens such as {p} are filled in from the learner's chosen option. */
function variant() {
  const opts = C && C.variants && C.variants.options;
  if (!opts) return null;
  return opts.find((o) => o.id === S.variant) || opts[0];
}
const fill = (text, map) => (map && text ? String(text).replace(/\{[^}]+\}/g, (t) => (t in map ? map[t] : t)) : text || '');
const R = (text) => fill(text, variant() && variant().replace);
const RR = (rom) => fill(rom, variant() && variant().romReplace);
const showRom = () => S.showRom !== false;
const romLine = (rom, cls = 'rom') => (rom && showRom() ? `<p class="${cls}">${esc(RR(rom))}</p>` : '');
const noteHtml = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

/* ---------- answer checking ---------- */
function today() { const d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); }
function norm(s) {
  let n = String(s).toLowerCase().normalize('NFC').replace(/[¿?¡!.,;:"'’‘()«»“”„…。、！？]/g, ' ');
  for (const w of (C.optionalWords || [])) {
    const wn = w.toLowerCase().normalize('NFC');
    n = C.noSpaces ? n.split(wn).join(' ') : n.replace(new RegExp(`(^|\\s)${wn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'g'), ' ');
  }
  n = n.replace(/\s+/g, ' ').trim();
  return C.noSpaces ? n.replace(/\s/g, '') : n;
}
function bare(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function check(card, input, reading) {
  const n = norm(input);
  if (!n) return 'no';
  if (card.kana) {
    // Japanese: also accept an answer whose pronunciation matches, typed in kana or heard in speech.
    const k = card.kana.map((x) => phon(norm(x)));
    if (/^[\u3041-\u30ffー]+$/.test(n) && k.includes(phon(n))) return 'ok';
    if (reading && k.includes(phon(norm(reading)))) return 'ok';
  }
  const alts = card.alts.map(R);
  const c = alts.map(norm);
  const pron = C.pronouns || [];
  if (card.cue && pron.includes(card.cue)) alts.forEach((a) => c.push(norm(`${card.cue} ${a}`)));
  if (c.includes(n)) return 'ok';
  if (c.map(bare).includes(bare(n))) return 'accent';
  return 'no';
}
// Speech recognition writes numbers as digits; turn them back into words before comparing.
const ES_NUM = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta'];
const esNum = (n) => { n = +n; return n <= 30 ? ES_NUM[n] : ({ 40: 'cuarenta', 50: 'cincuenta', 60: 'sesenta' })[n] || String(n); };
const TH_DIG = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
function thNum(n) {
  n = +n;
  if (!Number.isFinite(n) || n > 99999) return String(n);
  if (n === 0) return TH_DIG[0];
  const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น'];
  const ds = String(n).split('').reverse();
  let out = '';
  for (let i = ds.length - 1; i >= 0; i--) {
    const d = +ds[i];
    if (!d) continue;
    if (i === 1) out += (d === 1 ? '' : d === 2 ? 'ยี่' : TH_DIG[d]) + 'สิบ';
    else if (i === 0) out += d === 1 && n > 10 ? 'เอ็ด' : TH_DIG[d];
    else out += (d === 1 && i === ds.length - 1 ? '' : TH_DIG[d]) + units[i]; // "ร้อย" for 100, as people say it
  }
  return out;
}
const IT_NUM = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove', 'dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
const IT_TENS = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];
function itNum(n) {
  n = +n;
  if (n < 20) return IT_NUM[n];
  if (n < 100) { const t = IT_TENS[Math.floor(n / 10)]; const u = n % 10; if (!u) return t; return (u === 1 || u === 8 ? t.slice(0, -1) : t) + (u === 3 ? 'tré' : IT_NUM[u]); }
  return String(n);
}
const FR_NUM = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'];
const FR_TENS = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
function frNum(n) {
  n = +n;
  if (n <= 16) return FR_NUM[n];
  if (n < 20) return `dix-${FR_NUM[n - 10]}`;
  if (n < 70) { const t = FR_TENS[Math.floor(n / 10)]; const u = n % 10; return !u ? t : u === 1 ? `${t} et un` : `${t}-${FR_NUM[u]}`; }
  if (n < 80) return n === 71 ? 'soixante et onze' : `soixante-${frNum(n - 60)}`;
  if (n === 80) return 'quatre-vingts';
  if (n < 100) return `quatre-vingt-${frNum(n - 80)}`;
  return String(n);
}
const JA_D = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
function jaNum(n) {
  n = +n;
  if (!Number.isInteger(n) || n > 99999) return String(n);
  if (!n) return '零';
  let out = '';
  if (n >= 10000) { out += JA_D[Math.floor(n / 10000)] + '万'; n %= 10000; }
  [[1000, '千'], [100, '百'], [10, '十']].forEach(([v, u]) => { const d = Math.floor(n / v); if (d) out += (d === 1 ? '' : JA_D[d]) + u; n %= v; });
  return out + JA_D[n];
}
function frHour(h) { h = +h; return h === 1 ? 'une heure' : `${frNum(h)} heures`; }
function spokenToText(s) {
  s = String(s).replace(/(\d),(\d{3})/g, '$1$2');
  if (C.numbers === 'es') {
    return s.replace(/(\d{1,2})[:.](\d{2})/g, (m, h, mm) => { mm = +mm; return esNum(h) + (mm === 30 ? ' y media' : mm === 15 ? ' y cuarto' : mm === 0 ? '' : ` y ${esNum(mm)}`); })
      .replace(/€/g, ' euros ').replace(/\d+/g, (d) => esNum(d)).replace(/\b(la) uno\b/gi, '$1 una');
  }
  if (C.numbers === 'th') return s.replace(/\d+/g, (d) => thNum(d));
  if (C.numbers === 'ja') return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/\d+/g, (d) => jaNum(d));
  if (C.numbers === 'fr') {
    return s.replace(/(\d{1,2})\s?[h:]\s?(\d{2})?\b/gi, (m, h, mm) => { mm = +(mm || 0); return frHour(h) + (mm === 30 ? ' et demie' : mm === 15 ? ' et quart' : mm === 0 ? '' : ` ${frNum(mm)}`); })
      .replace(/(\d+),(\d{2})\s?€/g, (m, e, c) => `${frNum(e)} euros ${frNum(c)}`).replace(/€/g, ' euros ').replace(/\d+/g, (d) => frNum(d)).replace(/\bun heure/g, 'une heure');
  }
  if (C.numbers === 'it') {
    return s.replace(/(\d{1,2})[:.](\d{2})/g, (m, h, mm) => { mm = +mm; const hw = +h === 1 ? "l'una" : `le ${itNum(h)}`; return hw + (mm === 30 ? ' e mezza' : mm === 15 ? ' e un quarto' : mm === 0 ? '' : ` e ${itNum(mm)}`); })
      .replace(/\balle le /g, 'alle ').replace(/\balle l'una/g, "all'una").replace(/\ba l'una/g, "all'una").replace(/€/g, ' euro ').replace(/\d+/g, (d) => itNum(d)).replace(/\balle uno\b/g, "all'una");
  }
  return s;
}
// Japanese readings: katakana with long vowels collapsed and particle spellings merged (は/わ, を/お, へ/え),
// so とおい, トーイ and 遠い (read トオイ) all compare equal.
const ROWS = { a: 'アカサタナハマヤラワガザダバパャァ', i: 'イキシチニヒミリギジヂビピィ', u: 'ウクスツヌフムユルグズヅブプュゥ', e: 'エケセテネヘメレゲゼデベペェ', o: 'オコソトノホモヨロヲゴゾドボポョォ' };
const vowelOf = (ch) => Object.keys(ROWS).find((v) => ROWS[v].includes(ch));
const LONG = { a: 'ア', i: 'イ', u: 'ウ', e: 'エイ', o: 'オウ' };
function phon(s) {
  const k = String(s).replace(/[\u3041-\u3096]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)).replace(/[ー\s・]/g, '');
  let out = '';
  for (const ch of k) {
    const v = vowelOf(out.slice(-1));
    if (v && LONG[v].includes(ch)) continue;
    out += ch;
  }
  return out.replace(/ハ/g, 'ワ').replace(/ヲ/g, 'オ').replace(/ヘ/g, 'エ').replace(/ヂ/g, 'ジ').replace(/ヅ/g, 'ズ');
}
function checkSpoken(card, text, reading) { return check(card, spokenToText(text), reading) === 'no' ? 'no' : 'ok'; }

/* ---------- state (per language, this device) ---------- */
function clean(r) {
  const s = { cards: {}, streak: 0, last: 0, mode: 'speak', slow: false, hands: false, perDay: 10, showRom: true, variant: '', newDay: 0, newCount: 0, t: 0 };
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
  s.hands = r.hands === true;
  if ([5, 10, 15, 20].includes(r.perDay)) s.perDay = r.perDay;
  if (r.showRom === false) s.showRom = false;
  if (typeof r.variant === 'string') s.variant = r.variant;
  return s;
}
let S = clean(null);
let PASS = store.get(PASS_KEY) || '';
let needPass = false; // set when the server says a passcode is required
function save() { if (!C) return; S.t = Date.now(); store.set(stateKey(C.id), JSON.stringify(S)); }
function loadState(id) { try { return clean(JSON.parse(store.get(stateKey(id)))); } catch { return clean(null); } }

/* ---------- audio ---------- */
const player = new Audio();
player.preload = 'auto';
let queue = [];
let audioDone = null; // runs once when the current playback (and its queue) finishes
let playGen = 0;      // bumps on every stop, so events from interrupted audio are ignored
const warmed = new Set();
let ttsVoice = null;
const audioFile = (t) => (t && AUDIO.files && AUDIO.files[t]) || null;

function pickVoice() {
  if (!('speechSynthesis' in window) || !C) return;
  const vs = speechSynthesis.getVoices();
  const lang = (C.lang || C.speechLanguage || '').toLowerCase();
  const base = lang.split('-')[0];
  ttsVoice = vs.find((v) => v.lang.toLowerCase().replace('_', '-') === lang) || vs.find((v) => v.lang.toLowerCase().startsWith(base)) || null;
}
function stopAll() {
  playGen++;
  audioDone = null;
  try { player.pause(); } catch {}
  try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch {}
}
function finishAudio() { const f = audioDone; audioDone = null; if (f) f(); }
function playNext() { if (queue.length) setTimeout(() => playNow(queue.shift()), 350); else finishAudio(); }
function playNow(t) {
  const g = playGen;
  let fired = false;
  const done = () => { if (fired || g !== playGen) return; fired = true; playNext(); };
  const f = audioFile(t);
  const rate = S.slow ? 0.75 : 1;
  if (f) {
    player.onended = done;
    player.onerror = done;
    player.src = `/audio/${C.id}/${f}`;
    player.defaultPlaybackRate = rate;
    player.playbackRate = rate;
    const p = player.play();
    if (p) p.catch((e) => { if (e && e.name === 'NotAllowedError') done(); });
    return;
  }
  if (!('speechSynthesis' in window)) { setTimeout(done, 0); return; }
  try {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = C.lang || C.speechLanguage;
    if (ttsVoice) u.voice = ttsVoice;
    u.rate = S.slow ? 0.7 : 0.95;
    u.onend = done;
    u.onerror = done;
    speechSynthesis.speak(u);
    setTimeout(done, 2000 + String(t).length * 120); // some browsers never fire onend
  } catch { setTimeout(done, 0); }
}
// Plays one sentence. cb runs when it has finished playing (used to start listening after a prompt).
function say(t, cb) { queue = []; stopAll(); audioDone = cb || null; if (!t) { finishAudio(); return; } playNow(R(t)); }
function sayAll(list) { if (!list.length) return; const l = list.map(R); queue = l.slice(1); stopAll(); playNow(l[0]); }
function warm(c) {
  if (!c) return;
  [c.base, c.target].forEach((t) => {
    const f = audioFile(R(t));
    if (f && !warmed.has(f)) { warmed.add(f); fetch(`/audio/${C.id}/${f}`).catch(() => {}); }
  });
}

/* ---------- recording and speech checking ---------- */
let rec = null;
let recTimer = 0;
let micBlocked = false;
let passErr = '';
const micSupported = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
const speechOn = () => S.mode === 'speak' && (!needPass || !!PASS) && micSupported() && !micBlocked;
function speechWhy() {
  if (S.mode !== 'speak') return '';
  if (!micSupported()) return 'This browser cannot record audio, so grade yourself.';
  if (micBlocked) return 'Microphone access is blocked, so grade yourself. Allow the microphone for this site in your browser settings to turn checking back on.';
  if (needPass && !PASS) return 'This app needs a passcode for speech checking. Enter it on the Today screen under Settings.';
  return '';
}
/* Hands-free: after a prompt plays, listening starts on its own, stops when you go quiet,
   and a correct answer moves to the next card by itself. */
const handsOn = () => !!(S.hands && sess && !sess.end && !sess.paused && tab === 'today' && speechOn() && document.visibilityState !== 'hidden');
const limitFor = (card, hands) => (card.base ? FAST_AUDIO : FAST_READ) + (hands ? 0 : TAP_ALLOWANCE);
const live = (tok) => !!(sess && !sess.end && sess.tok === tok);

// One AudioContext, created on a tap so phone browsers let it run. It measures how loud the mic is,
// to tell when you start talking (your speed) and when you stop (so recording ends by itself).
let actx = null;
function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!actx) actx = new AC();
    if (actx.state === 'suspended') actx.resume().catch(() => {});
  } catch {}
}
function listen(stream, card, tok) {
  if (!actx) return null;
  let src;
  let an;
  try { src = actx.createMediaStreamSource(stream); an = actx.createAnalyser(); an.fftSize = 1024; src.connect(an); } catch { return null; }
  const buf = new Float32Array(an.fftSize);
  const t1 = performance.now();
  const wait = card.base ? 7000 : 9000; // give up if nothing is said by then
  const v = { ok: true, heard: false, stop };
  let noise = 0.004; // running estimate of background noise
  let loud = 0;
  let first = 0;
  let quiet = 0;
  const iv = setInterval(() => {
    if (!live(tok) || !rec) { stop(); return; }
    if (actx.state !== 'running') { if (performance.now() - t1 > 400) { v.ok = false; stop(); } return; }
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const now = performance.now();
    if (!v.heard) {
      if (rms > Math.max(0.02, noise * 4)) {
        if (!loud++) first = now;
        if (loud >= 2) { v.heard = true; sess.onset = first; }
      } else { loud = 0; noise = noise * 0.9 + rms * 0.1; }
      if (!v.heard && now - t1 > wait) { stop(); stopRec(); }
    } else if (rms < Math.max(0.012, noise * 2.5)) {
      if (!quiet) quiet = now;
      else if (now - quiet > 900) { stop(); stopRec(); }
    } else quiet = 0;
  }, 50);
  function stop() { clearInterval(iv); try { src.disconnect(); } catch {} }
  return v;
}
function afterPrompt(tok) {
  return () => {
    if (!live(tok) || sess.shown || sess.phase) return;
    sess.t0 = performance.now(); // speed is measured from here
    if (handsOn()) setTimeout(() => { if (live(tok) && !sess.shown && !sess.phase && handsOn()) startRec(true); }, 150);
  };
}
let starting = false;
async function startRec(auto = false) {
  if (!sess || sess.end || sess.phase || starting) return;
  const tok = sess.tok;
  const card = BY[cur().id];
  if (!sess.t0) sess.t0 = performance.now();
  starting = true;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {
    starting = false;
    // A browser that refuses to open the mic without a tap: pause hands-free rather than give up on checking.
    if (auto && live(tok)) { sess.paused = true; sess.micErr = 'Tap the mic to answer. Hands-free is paused.'; render(); return; }
    micBlocked = true; render(); return;
  }
  starting = false;
  if (!live(tok) || sess.shown || tab !== 'today') { stream.getTracks().forEach((t) => t.stop()); return; }
  stopAll();
  const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/aac'].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
  const chunks = [];
  let r;
  try { r = new MediaRecorder(stream, type ? { mimeType: type } : undefined); } catch {
    stream.getTracks().forEach((t) => t.stop()); micBlocked = true; render(); return;
  }
  rec = r;
  r.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  r.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    if (r.vad) r.vad.stop();
    if (rec === r) rec = null;
    if (r.discard || !live(tok)) return;
    if (r.vad && r.vad.ok && !r.vad.heard) { nothingHeard(); return; } // silence: skip the server call
    transcribe(new Blob(chunks, { type: r.mimeType || type || 'audio/mp4' }));
  };
  r.start();
  Object.assign(sess, { phase: 'rec', micErr: '', onset: 0, handsRec: auto });
  r.vad = listen(stream, card, tok);
  render();
  recTimer = setTimeout(() => stopRec(), 12000);
}
// discard: stop without checking the answer (leaving the screen, pausing).
function stopRec(discard) {
  clearTimeout(recTimer);
  if (rec && rec.state !== 'inactive') { if (discard) rec.discard = true; rec.stop(); }
  if (discard && sess && sess.phase === 'rec') sess.phase = null;
}
function nothingHeard() {
  Object.assign(sess, { phase: null, heard: '', res: 'no', shown: true });
  render();
  auto();
}
async function transcribe(blob) {
  if (!sess || sess.end) return;
  sess.phase = 'busy';
  render();
  const id = cur().id;
  try {
    const r = await fetch(`/api/stt?lang=${encodeURIComponent(C.speechLanguage)}`, {
      method: 'POST',
      headers: { 'Content-Type': blob.type || 'application/octet-stream', 'x-passcode': PASS },
      body: blob,
    });
    if (!sess || sess.end || cur().id !== id) return;
    if (r.status === 401) {
      PASS = ''; store.set(PASS_KEY, null); needPass = true;
      sess.phase = null;
      sess.micErr = 'Speech checking needs a passcode for this app. Enter it on the Today screen under Settings.';
      render();
      return;
    }
    if (r.status === 400) { sess.phase = null; sess.micErr = 'That recording was too short. Tap and speak again.'; render(); return; }
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    sess.heard = j.text || '';
    sess.res = sess.heard ? checkSpoken(BY[id], sess.heard, j.reading) : 'no';
    if (sess.res === 'ok') {
      // Speed grading: right but slow comes back tomorrow, right and fast moves up the schedule.
      const lat = sess.onset && sess.t0 ? Math.max(0, sess.onset - sess.t0) : null;
      sess.lat = lat;
      sess.autoG = lat != null && lat > limitFor(BY[id], sess.handsRec) ? 'slow' : 'good';
      if (lat != null) sess.lats.push(lat);
    }
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
    if (r.status === 204) { PASS = v; store.set(PASS_KEY, v); micBlocked = false; needPass = false; }
    else if (r.status === 401) passErr = 'That passcode is not right. Ask the person who shared the app with you.';
    else passErr = `The server answered with an error (${r.status}). Try again later.`;
  } catch {
    passErr = 'Could not reach the server. Check your connection and try again.';
  }
  render();
}

/* ---------- session ---------- */
let tab = 'today';
let sess = null;
let confirmReset = false;
let copied = false;
function allowance() { return Math.max(0, S.perDay - (S.newDay === today() ? S.newCount : 0)); }
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
  sess = { q, i: 0, total: q.length, done: new Set(), missed: new Set(), rev: p.due.length, neu: p.fresh.length, lats: [], paused: false, tok: 0 };
  resetCard();
  render();
  auto();
}
function resetCard() {
  Object.assign(sess, { shown: false, res: null, typed: '', heard: null, phase: null, micErr: '', t0: 0, onset: 0, lat: null, autoG: null, handsRec: false, tok: sess.tok + 1 });
}
function cur() { return sess.q[sess.i]; }
function countNew() { const t = today(); if (S.newDay !== t) { S.newDay = t; S.newCount = 0; } S.newCount++; }
function touchDay() { const t = today(); if (S.last !== t) { S.streak = S.last === t - 1 ? S.streak + 1 : 1; S.last = t; } }
function advance() {
  stopRec(true);
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
  const tok = sess.tok;
  const nx = sess.q[sess.i + 1];
  if (nx) warm(BY[nx.id]);
  if (st.phase === 'learn') { say(c.target); return; }
  if (sess.shown) {
    // Hands-free: after a correct answer, play it once more, then move on (a little later if it was slow,
    // so there is time to tap "Count as automatic").
    const go = handsOn() && sess.res === 'ok';
    say(c.target, go ? () => setTimeout(() => { if (live(tok) && handsOn()) grade(sess.autoG || 'good'); }, sess.autoG === 'slow' ? 1800 : 600) : null);
    return;
  }
  if (c.base) say(c.base, afterPrompt(tok));
  else { stopAll(); afterPrompt(tok)(); }
}
function togglePause() {
  sess.paused = !sess.paused;
  sess.micErr = '';
  if (sess.paused) { stopRec(true); stopAll(); render(); return; }
  unlockAudio();
  render();
  if (!sess.shown && !sess.phase && cur().phase === 'test') afterPrompt(sess.tok)();
}

/* ---------- views ---------- */
function seg(name, opts, val) {
  return `<div class="seg" role="group">${opts.map((o) => `<button data-act="set" data-k="${name}" data-v="${o[0]}" aria-pressed="${String(val) === String(o[0])}">${esc(o[1])}</button>`).join('')}</div>`;
}
function options() {
  let h = '<div class="opts">'
    + `<div class="opt"><span class="lbl">Answer by</span>${seg('mode', [['speak', 'Speaking'], ['type', 'Typing']], S.mode)}</div>`
    + (S.mode === 'speak' ? `<div class="opt"><span class="lbl">Hands-free</span>${seg('hands', [['true', 'On'], ['false', 'Off']], S.hands)}</div>` : '')
    + `<div class="opt"><span class="lbl">Voice speed</span>${seg('slow', [['false', 'Normal'], ['true', 'Slow']], S.slow)}</div>`;
  if (C.variants) h += `<div class="opt"><span class="lbl">${esc(C.variants.label || 'Form')}</span>${seg('variant', C.variants.options.map((o) => [o.id, o.label]), variant().id)}</div>`;
  if (hasRom()) h += `<div class="opt"><span class="lbl">${esc(C.romanization || 'Pronunciation')}</span>${seg('showRom', [['true', 'Show'], ['false', 'Hide']], showRom())}</div>`;
  h += `<div class="opt"><span class="lbl">New items a day</span>${seg('perDay', [[5, '5'], [10, '10'], [15, '15'], [20, '20']], S.perDay)}</div>`;
  return h + '</div>';
}
const hasRom = () => CARDS.some((c) => c.rom);
function vSpeech() {
  if (S.mode !== 'speak') return '';
  if (!micSupported()) return '<p class="muted small">This browser cannot record audio, so you will grade yourself.</p>';
  if (!needPass) return `<p class="muted small">Speech checking is on.${micBlocked ? ' The microphone is blocked right now; allow it in your browser settings.' : ''}</p>`;
  return '<form id="pf" class="pass" autocomplete="off"><label class="lbl" for="pass">Passcode for speech checking</label>'
    + '<div class="row"><input type="password" id="pass" autocomplete="current-password"><button class="btn ghost" type="submit">Turn on</button></div>'
    + `${passErr ? `<p class="err">${esc(passErr)}</p>` : '<p class="muted small">This copy of the app asks for a passcode. Get it from the person who shared it. Without it, you say the answer aloud and grade yourself.</p>'}</form>`;
}
function vHome() {
  const p = plan(allowance());
  const n = p.due.length + p.fresh.length;
  const left = CARDS.filter((c) => !S.cards[c.id]).length;
  const mins = Math.max(1, Math.round((p.due.length * 15 + p.fresh.length * 40) / 60));
  let h = `<section class="sheet"><p class="lbl">Today · ${esc(C.name)}</p>`;
  if (n) {
    h += `<h1>${p.due.length ? 'Review, then new material' : 'Start with the next dialogue'}</h1>`
      + `<div class="stats"><div><b>${p.due.length}</b><span>reviews due</span></div><div><b>${p.fresh.length}</b><span>new items</span></div><div><b>${mins}</b><span>minutes, roughly</span></div></div>`
      + '<button class="btn wide" data-act="start" data-primary>Start session</button>';
  } else {
    h += `<h1>Nothing is due right now</h1><p class="muted">${left ? "You have done today's new items. Reviews come back tomorrow." : 'You have learned every item in the course. Reviews keep coming back on schedule.'}</p>`
      + (left ? '<button class="btn ghost wide" data-act="more">Add 5 more new items</button>' : '');
  }
  h += `<p class="muted small">Streak: ${S.streak}${S.streak === 1 ? ' day' : ' days'} · ${Object.keys(S.cards).length} of ${CARDS.length} items started</p></section>`;
  h += `<section class="sheet"><p class="lbl">Settings</p>${options()}${vSpeech()}</section>`;
  return h;
}
function vCue(c) {
  if (!c.cue) return '';
  const extra = [c.cueRom && showRom() ? RR(c.cueRom) : '', c.cueEn].filter(Boolean).join(' · ');
  return `<p class="cue"><span>${esc(R(c.cue))}</span>${extra ? `<em>${esc(extra)}</em>` : ''}</p>`;
}
function vSession() {
  const st = cur();
  const c = BY[st.id];
  const u = U[c.u];
  let h = `<div class="bar"><i style="width:${Math.round((sess.done.size / sess.total) * 100)}%"></i></div>`
    + `<div class="meta"><span>${esc(c.label)} · ${esc(u.en || u.title)}</span><span>${sess.done.size} / ${sess.total}</span></div><section class="sheet">`;
  if (st.phase === 'learn') {
    h += `<p class="how">New line. Listen, then say it aloud three times.</p><p class="who">${esc(c.who)}</p>`
      + `<p class="es" lang="${esc(C.lang)}">${esc(R(c.target))}</p>${romLine(c.rom)}<p class="en">${esc(c.en)}</p>`
      + `<div class="row"><button class="btn ghost" data-act="say" data-t="${esc(c.target)}">${PLAY} Listen</button><button class="btn" data-act="learned" data-primary>I said it three times</button></div>`;
  } else {
    h += `<p class="how">${esc(c.kind === 'line' ? C.sayIt : c.how)}</p>`;
    if (c.base) {
      h += `<p class="es" lang="${esc(C.lang)}">${esc(R(c.base))} <button class="play" data-act="say" data-t="${esc(c.base)}" aria-label="Play the sentence">${PLAY}</button></p>`
        + romLine(c.baseRom) + (c.baseEn ? `<p class="en small">${esc(c.baseEn)}</p>` : '') + vCue(c);
    } else {
      h += `<p class="enq">${esc(c.en)}</p>`;
    }
    if (!sess.shown) {
      if (S.mode === 'type') {
        const keys = C.keys || [];
        h += `<form id="f" autocomplete="off"><input type="text" id="ans" aria-label="Your answer" autocapitalize="off" autocorrect="off" spellcheck="false" lang="${esc(C.lang)}">`
          + (keys.length ? `<div class="keys">${keys.map((k) => `<button type="button" data-act="key" data-t="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : '')
          + (C.noSpaces || !keys.length ? `<p class="muted small">Type in ${esc(C.name)} script. If your keyboard can't, add a ${esc(C.name)} keyboard in your device settings or switch to Speaking.</p>` : '')
          + '<div class="row"><button class="btn" type="submit">Check</button><button class="btn link" type="button" data-act="reveal">I do not know</button></div></form>';
      } else if (speechOn()) {
        const ph = sess.phase;
        const idle = handsOn() ? 'Get ready. Listening starts on its own.' : 'Tap and say your answer';
        h += '<div class="mic-wrap">'
          + (ph === 'busy'
            ? `<button class="mic busy" disabled aria-label="Checking your answer">${SPIN}</button><p class="mic-label muted">Checking…</p>`
            : `<button class="mic${ph === 'rec' ? ' rec' : ''}" data-act="mic" data-primary aria-label="${ph === 'rec' ? 'Stop recording' : 'Record your answer'}">${ph === 'rec' ? STOP : MIC}</button><p class="mic-label">${ph === 'rec' ? 'Listening… stops when you pause' : idle}</p>`)
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
        const secs = sess.lat != null ? `${(sess.lat / 1000).toFixed(1)} s` : '';
        const slow = sess.res === 'ok' && sess.autoG === 'slow';
        const v = slow ? `Correct, but slow · ${secs}`
          : { ok: `Correct${secs ? ` · ${secs}` : ''}`, accent: 'Right words. Check the accents.', no: 'Not yet' }[sess.res];
        h += `<p class="verdict v-${slow ? 'accent' : sess.res}">${esc(v)}</p>`;
        if (slow) h += '<p class="muted small">It comes back tomorrow so it gets faster.</p>';
        if (sess.heard !== null) h += `<p class="muted">You said: ${sess.heard ? esc(sess.heard) : '(nothing was heard)'}</p>`;
        else if (sess.res !== 'ok' && sess.typed) h += `<p class="muted">You wrote: ${esc(sess.typed)}</p>`;
      }
      h += `<p class="es" lang="${esc(C.lang)}">${esc(R(c.target))} <button class="play" data-act="say" data-t="${esc(c.target)}" aria-label="Play the answer">${PLAY}</button></p>${romLine(c.rom)}`;
      if (c.kind === 'line') h += `<p class="who">${esc(c.who)}</p>`;
      h += '</div>';
      if (sess.res === 'ok' && sess.autoG === 'slow') h += '<div class="row"><button class="btn" data-act="grade" data-g="slow" data-primary>Next</button><button class="btn link" data-act="grade" data-g="good">Count as automatic</button></div>';
      else if (sess.res === 'ok' || sess.res === 'accent') h += '<button class="btn wide" data-act="grade" data-g="good" data-primary>Next</button>';
      else if (sess.res === 'no') h += '<div class="row"><button class="btn" data-act="grade" data-g="miss" data-primary>Next</button><button class="btn link" data-act="grade" data-g="good">Count it as correct</button></div>';
      else h += '<div class="grades"><button class="g-miss" data-act="grade" data-g="miss">Missed<small>again today</small></button><button class="g-slow" data-act="grade" data-g="slow">Slow<small>tomorrow</small></button><button class="g-good" data-act="grade" data-g="good">Automatic<small>later</small></button></div>';
    }
  }
  const pause = S.hands && S.mode === 'speak' && speechOn()
    ? `<button class="btn link" data-act="pause">${sess.paused ? 'Resume hands-free' : 'Pause hands-free'}</button>` : '';
  h += `</section><div class="row"><button class="btn link" data-act="quit">End session</button>${pause}</div>`;
  return h;
}
function vEnd() {
  const left = CARDS.filter((c) => !S.cards[c.id]).length;
  const t = today();
  const tom = CARDS.filter((c) => S.cards[c.id] && S.cards[c.id].d <= t + 1).length;
  return `<section class="sheet"><p class="lbl">Session complete</p><h1>${esc(C.doneMessage || 'Well done. See you tomorrow.')}</h1>`
    + `<div class="stats"><div><b>${sess.rev}</b><span>reviews</span></div><div><b>${sess.neu}</b><span>new items</span></div><div><b>${sess.missed.size}</b><span>needed a repeat</span></div></div>`
    + `<p class="muted">${tom} items will be due by tomorrow. Streak: ${S.streak}${S.streak === 1 ? ' day' : ' days'}.</p>`
    + (sess.lats.length ? `<p class="muted">Average time to start answering: ${(sess.lats.reduce((a, b) => a + b, 0) / sess.lats.length / 1000).toFixed(1)} s across ${sess.lats.length} spoken answers.</p>` : '')
    + `<div class="row"><button class="btn" data-act="home" data-primary>Done</button>${left ? '<button class="btn ghost" data-act="more">Add 5 more new items</button>' : ''}</div></section>`;
}
function vCourse() {
  let h = '';
  U.forEach((u, ui) => {
    const cs = CARDS.filter((c) => c.u === ui);
    const seen = cs.filter((c) => S.cards[c.id]).length;
    h += `<details${ui === 0 ? ' open' : ''}><summary><span>Unit ${ui + 1} · <span lang="${esc(C.lang)}">${esc(u.title)}</span> <span class="muted" style="font-weight:400">${esc(u.en || '')}</span></span><small>${seen} / ${cs.length} started</small></summary><div class="dbody">`
      + `<div class="row"><button class="btn ghost" data-act="dlg" data-u="${ui}">${PLAY} Play the dialogue</button></div><ol class="dlg">`
      + u.dialogue.map((l) => `<li><button class="play" data-act="say" data-t="${esc(l.target)}" aria-label="Play this line">${PLAY}</button><div><p class="who">${esc(l.speaker)}</p><p class="l-es" lang="${esc(C.lang)}">${esc(R(l.target))}</p>${romLine(l.rom, 'l-rom')}<p class="l-en">${esc(l.en)}</p></div></li>`).join('')
      + `</ol>${u.note ? `<p class="note">${noteHtml(u.note)}</p>` : ''}</div></details>`;
  });
  h += `<div class="row">${confirmReset
    ? `<span class="muted">Erase all ${esc(C.name)} progress on this device?</span><button class="btn" data-act="reset">Erase</button><button class="btn ghost" data-act="noreset">Cancel</button>`
    : '<button class="btn link" data-act="askreset">Reset progress</button>'}</div>`;
  return h;
}
function vPick() {
  let h = '<section class="sheet"><p class="lbl">Choose a language</p><h1>What do you want to learn?</h1><p class="muted">You can switch any time. Each language keeps its own progress.</p></section><div class="langs">';
  for (const c of INDEX) {
    const st = loadState(c.id);
    const started = Object.keys(st.cards).length;
    h += `<button class="lang${C && C.id === c.id ? ' on' : ''}" data-act="pick" data-id="${esc(c.id)}">`
      + `<span class="lang-top"><b>${esc(c.name)}</b>${c.nativeName ? `<span class="native">${esc(c.nativeName)}</span>` : ''}</span>`
      + `${c.variety ? `<span class="muted small">${esc(c.variety)} · ${c.units} units</span>` : `<span class="muted small">${c.units} units</span>`}`
      + `${c.description ? `<span class="small">${esc(c.description)}</span>` : ''}`
      + `${started ? `<span class="pill">${started} items started</span>` : ''}</button>`;
  }
  h += '</div><p class="muted small center">Want another language? See the <button class="btn link inline" data-tab="guide">Guide</button>.</p>';
  return h;
}
function vGuide() {
  return `<section class="sheet guide"><p class="lbl">Guide</p><h1>How to use Autopilot</h1>
<p>Autopilot teaches the way US diplomats are trained: you memorise short real-life dialogues, then repeat drills until the answer comes out on autopilot, without thinking. About 10 to 15 minutes a day works best.</p>
<h2>Your daily session</h2>
<ol>
<li><b>Start session</b> on the Today screen. It mixes reviews that are due with a few new items.</li>
<li><b>New line</b> cards: listen, then say the line out loud three times.</li>
<li><b>Drill</b> cards: change a sentence (swap in a word, make it negative) or translate from English. Answer out loud before you check.</li>
<li>Items you miss come back a few cards later. Items you know come back in 1, 3, 7, 14, 30 and 60 days.</li>
<li>Speed counts. A spoken answer is <b>automatic</b> only if you start talking within about 2.5 seconds of the prompt (3.5 seconds when you have to read English first). Correct but slower answers come back tomorrow so they get faster.</li>
</ol>
<h2>Make it fit you</h2>
<ul>
<li><b>Language:</b> pick it from the menu at the top right. Each language keeps its own progress.</li>
<li><b>Answer by:</b> Speaking (the app listens and checks you) or Typing.</li>
<li><b>Hands-free</b> (Speaking only): the app starts listening when the prompt finishes, stops when you go quiet and moves on after a correct answer. No tapping. Pause it from the bottom of the card.</li>
<li><b>Voice speed:</b> Slow plays everything at three-quarter speed.</li>
<li><b>Polite form</b> (Thai): pick Male (khráp) or Female (khâ). Every sentence and recording switches to match.</li>
<li><b>Pronunciation:</b> show or hide the spelling in Latin letters under each sentence. Hide it once you can read the script.</li>
<li><b>New items a day:</b> 5 for a light pace, 20 if your trip is soon.</li>
</ul>
<h2>Speech checking</h2>
<p>In Speaking mode, tap the round button, say your answer and tap again. Your browser asks for the microphone the first time; tap Allow. If the Today screen asks for a passcode, get it from the person who shared the app. To use it like an app, add it to your home screen from the browser's Share or menu button.</p>
<h2>Add a new language or topic</h2>
<ol>
<li>Tap <b>Copy the course prompt</b> below.</li>
<li>Open <a href="https://claude.ai" target="_blank" rel="noopener">Claude</a>, paste it, and replace the first lines with what you want, for example: "Japanese, for a two-week trip to Tokyo, I'm a complete beginner."</li>
<li>Claude writes a course file. Save it with the name it gives you, such as <code>ja.json</code>.</li>
<li>Send the file to the person who runs this app. They upload it to the <code>courses</code> folder on GitHub and the app makes the recordings and adds it to the language list within a few minutes.</li>
</ol>
<div class="row"><button class="btn" data-act="copyprompt">${copied ? 'Copied' : 'Copy the course prompt'}</button><a class="btn ghost" href="/course-prompt.txt" target="_blank" rel="noopener">View it</a></div>
<h2>Run your own copy</h2>
<p>Want your own version, with your own languages and your own voice? It's free to host and takes about 30 minutes with no coding. Follow the step-by-step <a href="${REPO}/blob/main/SETUP.md" target="_blank" rel="noopener">setup guide</a>.</p>
<p class="muted small">Courses are written with AI help and have not all been checked by native speakers. If a sentence sounds wrong to a native speaker, trust them.</p>
</section>`;
}
function vHeader() {
  const nav = [['today', 'Today'], ['course', 'Course'], ['guide', 'Guide']]
    .map(([k, l]) => `<button data-tab="${k}" aria-current="${tab === k ? 'page' : 'false'}">${l}</button>`).join('');
  $('#nav').innerHTML = nav;
  const sel = $('#langsel');
  sel.innerHTML = (C ? '' : '<option value="" selected disabled>Choose language</option>')
    + INDEX.map((c) => `<option value="${esc(c.id)}"${C && C.id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
}
function render() {
  vHeader();
  let html;
  if (tab === 'guide') html = vGuide();
  else if (tab === 'pick' || !C) html = vPick();
  else if (tab === 'course') html = vCourse();
  else html = !sess ? vHome() : sess.end ? vEnd() : vSession();
  $('#view').innerHTML = html;
  const f = $('#ans') || $('[data-primary]');
  if (f && sess && tab === 'today') { try { f.focus({ preventScroll: true }); } catch {} }
}

/* ---------- switching language ---------- */
async function openCourse(id) {
  try {
    const [course, manifest] = await Promise.all([
      fetch(`/courses/${id}.json`, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch(`/audio/${id}/manifest.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : { files: {} })).catch(() => ({ files: {} })),
    ]);
    stopRec(true); stopAll();
    buildCards(course);
    AUDIO = manifest && manifest.files ? manifest : { files: {} };
    S = loadState(id);
    if (C.variants && !C.variants.options.some((o) => o.id === S.variant)) S.variant = C.variants.options[0].id;
    store.set(COURSE_KEY, id);
    try { history.replaceState(null, '', `#${id}`); } catch {}
    sess = null;
    tab = 'today';
    pickVoice();
    $('#audio-note').textContent = Object.keys(AUDIO.files).length ? '' : `Recorded ${C.name} audio is not ready yet, so the device voice is used for now.`;
    document.title = `Autopilot · ${C.name}`;
  } catch {
    $('#view').innerHTML = '<section class="sheet"><p class="err">That course could not be loaded. Check your connection and try again.</p></section>';
    return;
  }
  render();
}

/* ---------- events ---------- */
document.addEventListener('click', async (e) => {
  const tb = e.target.closest('[data-tab]');
  if (tb) { tab = tb.dataset.tab; confirmReset = false; copied = false; if (sess && tab !== 'today') { stopRec(true); stopAll(); } render(); window.scrollTo(0, 0); return; }
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const a = b.dataset.act;
  if (a === 'pick') openCourse(b.dataset.id);
  else if (a === 'start') { unlockAudio(); start(allowance()); }
  else if (a === 'more') { unlockAudio(); start(5); }
  else if (a === 'say') {
    // Replaying the prompt restarts the speed clock (and hands-free listening) once it ends.
    const waiting = sess && !sess.end && tab === 'today' && !sess.shown && !sess.phase && cur().phase === 'test';
    say(b.dataset.t, waiting ? afterPrompt(sess.tok) : null);
  }
  else if (a === 'pause') togglePause();
  else if (a === 'dlg') sayAll(U[+b.dataset.u].dialogue.map((l) => l.target));
  else if (a === 'learned') learned();
  else if (a === 'mic') { unlockAudio(); if (sess.phase === 'rec') stopRec(); else if (!sess.phase) startRec(); }
  else if (a === 'reveal') { sess.shown = true; sess.res = S.mode === 'type' ? 'no' : null; sess.typed = ''; render(); auto(); }
  else if (a === 'grade') grade(b.dataset.g);
  else if (a === 'quit' || a === 'home') { stopRec(true); stopAll(); sess = null; render(); }
  else if (a === 'set') {
    const k = b.dataset.k; const v = b.dataset.v;
    if (k === 'mode') S.mode = v;
    else if (k === 'hands') { S.hands = v === 'true'; unlockAudio(); }
    else if (k === 'slow') S.slow = v === 'true';
    else if (k === 'showRom') S.showRom = v === 'true';
    else if (k === 'perDay') S.perDay = +v;
    else if (k === 'variant') S.variant = v;
    save(); render();
  }
  else if (a === 'copyprompt') {
    try {
      const txt = await fetch('/course-prompt.txt').then((r) => r.text());
      await navigator.clipboard.writeText(txt);
      copied = true; render();
    } catch { window.open('/course-prompt.txt', '_blank'); }
  }
  else if (a === 'key') {
    const i = $('#ans');
    if (i) {
      const s = i.selectionStart ?? i.value.length;
      const x = i.selectionEnd ?? s;
      i.value = i.value.slice(0, s) + b.dataset.t + i.value.slice(x);
      i.focus();
      i.setSelectionRange(s + b.dataset.t.length, s + b.dataset.t.length);
    }
  }
  else if (a === 'askreset') { confirmReset = true; render(); }
  else if (a === 'noreset') { confirmReset = false; render(); }
  else if (a === 'reset') { S = clean({ mode: S.mode, slow: S.slow, perDay: S.perDay, showRom: S.showRom, variant: S.variant }); sess = null; confirmReset = false; save(); render(); }
});
// Leaving the app mid-session (phone call, switching apps): stop listening and pause hands-free.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden' || !sess || sess.end) return;
  stopRec(true);
  stopAll();
  if (S.hands) sess.paused = true;
  render();
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'langsel' && e.target.value) openCourse(e.target.value);
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
    const idx = await fetch('/courses/index.json', { cache: 'no-cache' }).then((r) => r.json());
    INDEX = idx.courses || [];
  } catch {
    $('#view').innerHTML = '<section class="sheet"><p class="err">The app could not load. Check your connection and reload.</p></section>';
    return;
  }
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = pickVoice;
  // Ask the server whether speech checking needs a passcode (only if APP_PASSCODE is set in Vercel).
  fetch('/api/stt', { headers: PASS ? { 'x-passcode': PASS } : {} })
    .then((r) => { if (r.status === 401) { needPass = true; if (PASS) { PASS = ''; store.set(PASS_KEY, null); } render(); } })
    .catch(() => {});
  const hash = (location.hash || '').replace('#', '');
  let id = INDEX.some((c) => c.id === hash) ? hash : store.get(COURSE_KEY);
  if (!id && store.get(stateKey('es'))) id = 'es'; // people who used the Spanish-only version
  if (id && INDEX.some((c) => c.id === id)) await openCourse(id);
  else { tab = 'pick'; render(); }
})();
