// Japanese pronunciation helper for speech checking. The same word can be written in kanji or
// kana (分かりません / わかりません), so the app compares readings as well as text. Uses kuromoji
// to turn text into katakana. Files starting with _ are not exposed as Vercel routes.
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
let tokenizerPromise = null;

function getTokenizer() {
  if (!tokenizerPromise) {
    const kuromoji = require('kuromoji');
    const dicPath = path.join(path.dirname(require.resolve('kuromoji/package.json')), 'dict');
    tokenizerPromise = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath }).build((err, t) => (err ? reject(err) : resolve(t)));
    }).catch((e) => { tokenizerPromise = null; throw e; });
  }
  return tokenizerPromise;
}

const KD = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
// 450 -> 四百五十, so digits from speech recognition read the same way as the course text.
export function kanjiNumber(n) {
  n = Number(n);
  if (!Number.isInteger(n) || n < 0 || n > 99999) return String(n);
  if (n === 0) return '零';
  let out = '';
  const man = Math.floor(n / 10000);
  if (man) out += KD[man] + '万';
  n %= 10000;
  [[1000, '千'], [100, '百'], [10, '十']].forEach(([v, u]) => {
    const d = Math.floor(n / v);
    if (d) out += (d === 1 ? '' : KD[d]) + u;
    n %= v;
  });
  return out + KD[n];
}

export function digitsToKanji(s) {
  return String(s).replace(/(\d),(\d{3})/g, '$1$2').replace(/\d+/g, (d) => kanjiNumber(d))
    .replace(/[０-９]/g, (c) => KD[c.charCodeAt(0) - 0xff10] || '零');
}

const toKata = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));

export async function reading(text) {
  const t = await getTokenizer();
  return t.tokenize(digitsToKanji(text)).map((w) => (w.reading && w.reading !== '*' ? w.reading : toKata(w.surface_form))).join('');
}
