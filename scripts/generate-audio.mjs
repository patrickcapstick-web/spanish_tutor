// Generates one MP3 per Spanish sentence in course.json with ElevenLabs and
// records them in audio/manifest.json. Sentences that already have audio for the
// current voice and model are skipped, so re-running only pays for new text.
// Usage: ELEVENLABS_API_KEY=... node scripts/generate-audio.mjs
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const VOICE_ID = 'Syqs6p4s6hxhfAyhhlbS'; // Castilian voice chosen in the ElevenLabs Voice Library
const MODEL_ID = 'eleven_multilingual_v2';
const FORMAT = 'mp3_44100_64';
const DIR = 'audio';
const MANIFEST = `${DIR}/manifest.json`;

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error('ELEVENLABS_API_KEY is not set. Add it as a repository secret.');
  process.exit(1);
}

const course = JSON.parse(await fs.readFile('course.json', 'utf8'));
const texts = new Set();
for (const unit of course.units) {
  for (const line of unit.dialogue) texts.add(line.es);
  for (const group of unit.drills) {
    for (const item of group.items) {
      if (item.base) texts.add(item.base);
      texts.add(item.answers[0]);
    }
  }
}

let manifest = { voice: VOICE_ID, model: MODEL_ID, files: {} };
try {
  const old = JSON.parse(await fs.readFile(MANIFEST, 'utf8'));
  if (old.voice === VOICE_ID && old.model === MODEL_ID && old.files) manifest.files = old.files;
} catch {}
await fs.mkdir(DIR, { recursive: true });

const exists = async (p) => fs.access(p).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileName = (t) =>
  crypto.createHash('sha1').update(`${VOICE_ID}|${MODEL_ID}|${t}`).digest('hex').slice(0, 16) + '.mp3';

async function synthesize(text) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=${FORMAT}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL_ID }),
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const detail = (await r.text()).slice(0, 300);
    if ((r.status === 429 || r.status >= 500) && attempt < 4) {
      await sleep(2000 * attempt);
      continue;
    }
    throw new Error(`HTTP ${r.status}: ${detail}`);
  }
}

let made = 0;
let failed = 0;
let chars = 0;
for (const text of texts) {
  const name = fileName(text);
  if (manifest.files[text] === name && (await exists(`${DIR}/${name}`))) continue;
  try {
    const audio = await synthesize(text);
    await fs.writeFile(`${DIR}/${name}`, audio);
    manifest.files[text] = name;
    made++;
    chars += text.length;
    console.log(`ok   ${text}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${text} -> ${e.message}`);
    if (failed <= 3) console.log(`::error title=ElevenLabs request failed::${e.message.replace(/[\r\n]+/g, ' ')}`);
    if (/quota|401|unauthor/i.test(e.message)) {
      console.error('Stopping: the key was rejected or the ElevenLabs quota is used up.');
      break;
    }
  }
}

// Drop entries for sentences no longer in the course, and their files.
const keep = new Set();
for (const t of Object.keys(manifest.files)) {
  if (texts.has(t)) keep.add(manifest.files[t]);
  else delete manifest.files[t];
}
for (const f of await fs.readdir(DIR)) {
  if (f.endsWith('.mp3') && !keep.has(f)) await fs.unlink(`${DIR}/${f}`);
}

const sorted = Object.fromEntries(Object.entries(manifest.files).sort(([a], [b]) => a.localeCompare(b, 'es')));
await fs.writeFile(MANIFEST, JSON.stringify({ voice: VOICE_ID, model: MODEL_ID, files: sorted }, null, 1) + '\n');

console.log(`\n${made} new clips (${chars} characters), ${failed} failed, ${Object.keys(sorted).length} of ${texts.size} sentences have audio.`);
if (failed && !made) process.exit(1);
