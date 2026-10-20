// Builds courses/index.json and generates one MP3 per sentence for every course in
// courses/*.json, using each course's own ElevenLabs voice and model. Audio for a
// course lives in audio/<course id>/ with a manifest.json mapping sentence to file.
// Sentences that already have audio for the same voice and model are skipped, so
// re-running only pays for new text.
// Usage: ELEVENLABS_API_KEY=... node scripts/generate-audio.mjs
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { expandVariants, sentencesOf, validateCourse } from './course-tools.mjs';

const FORMAT = 'mp3_44100_64';
const key = process.env.ELEVENLABS_API_KEY;

const exists = (p) => fs.access(p).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const notice = (kind, title, msg) => console.log(`::${kind} title=${title}::${String(msg).replace(/[\r\n]+/g, ' ')}`);

// 1. Read and check every course, then write the index the app uses for its language picker.
const courseFiles = (await fs.readdir('courses')).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
const courses = [];
let invalid = 0;
for (const f of courseFiles) {
  let course;
  try {
    course = JSON.parse(await fs.readFile(`courses/${f}`, 'utf8'));
  } catch (e) {
    invalid++;
    notice('error', `${f} is not valid JSON`, e.message);
    continue;
  }
  const problems = validateCourse(course, f);
  if (problems.length) {
    invalid++;
    problems.slice(0, 8).forEach((p) => notice('error', `Problem in ${f}`, p));
    continue;
  }
  courses.push(course);
}
const index = courses.map((c) => ({
  id: c.id,
  name: c.name,
  variety: c.variety || '',
  nativeName: c.nativeName || '',
  description: c.description || '',
  units: c.units.length,
}));
await fs.writeFile('courses/index.json', JSON.stringify({ courses: index }, null, 1) + '\n');
console.log(`Course index: ${index.map((c) => c.id).join(', ')}${invalid ? ` (${invalid} file(s) skipped, see errors)` : ''}`);

if (!key) {
  notice('error', 'Missing key', 'ELEVENLABS_API_KEY is not set. Add it as a repository secret.');
  process.exit(1);
}

// 2. Generate audio per course.
async function synthesize(text, voice, model) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=${FORMAT}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: model }),
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
const FATAL = /quota|401|unauthor|invalid_api_key|authentication_error|402|payment_required|voice_not_found/i;

let failedTotal = 0;
let madeTotal = 0;
for (const course of courses) {
  const dir = `audio/${course.id}`;
  const manifestPath = `${dir}/manifest.json`;
  const voice = course.voice;
  const model = course.model || 'eleven_multilingual_v2';
  await fs.mkdir(dir, { recursive: true });

  let files = {};
  try {
    const old = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    if (old.voice === voice && old.model === model && old.files) files = old.files;
  } catch {}

  const texts = new Set();
  for (const s of sentencesOf(course)) for (const t of expandVariants(course, s)) texts.add(t);

  const fileName = (t) => crypto.createHash('sha1').update(`${voice}|${model}|${t}`).digest('hex').slice(0, 16) + '.mp3';
  let made = 0;
  let failed = 0;
  for (const text of texts) {
    const name = fileName(text);
    if (files[text] === name && (await exists(`${dir}/${name}`))) continue;
    try {
      await fs.writeFile(`${dir}/${name}`, await synthesize(text, voice, model));
      files[text] = name;
      made++;
      console.log(`ok   [${course.id}] ${text}`);
    } catch (e) {
      failed++;
      console.error(`FAIL [${course.id}] ${text} -> ${e.message}`);
      if (failed <= 3) notice('error', `ElevenLabs request failed (${course.id})`, e.message);
      if (FATAL.test(e.message)) {
        console.error(`Stopping ${course.id}: ElevenLabs refused the request (key, plan, voice or quota).`);
        break;
      }
    }
  }

  // Drop entries and files for sentences no longer in the course.
  const keep = new Set();
  for (const t of Object.keys(files)) {
    if (texts.has(t)) keep.add(files[t]);
    else delete files[t];
  }
  for (const f of await fs.readdir(dir)) if (f.endsWith('.mp3') && !keep.has(f)) await fs.unlink(`${dir}/${f}`);

  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)));
  await fs.writeFile(manifestPath, JSON.stringify({ voice, model, files: sorted }, null, 1) + '\n');
  const have = Object.keys(sorted).length;
  const msg = `${course.name}: ${made} new clips, ${failed} failed, ${have} of ${texts.size} sentences have audio.`;
  console.log(msg);
  notice(have === texts.size ? 'notice' : 'warning', `Audio for ${course.id}`, msg);
  failedTotal += failed;
  madeTotal += made;
}

// Clean up audio folders for courses that were removed.
for (const d of await fs.readdir('audio', { withFileTypes: true })) {
  if (d.isDirectory() && !courses.some((c) => c.id === d.name) && !courseFiles.includes(`${d.name}.json`)) {
    await fs.rm(`audio/${d.name}`, { recursive: true, force: true });
  }
}

if ((failedTotal && !madeTotal) || invalid) process.exit(1);
