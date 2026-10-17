// Speech checking: receives a short recording from the app, sends it to
// ElevenLabs speech-to-text and returns { text }. The ElevenLabs key stays here
// on the server. Every call must carry the APP_PASSCODE in the x-passcode header.
import { timingSafeEqual } from 'node:crypto';

const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB
const STT_URL = 'https://api.elevenlabs.io/v1/speech-to-text';
const MODEL = 'scribe_v2';

function passcodeOk(given) {
  const want = process.env.APP_PASSCODE || '';
  if (!want || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) return null;
    chunks.push(chunk);
  }
  if (chunks.length) return Buffer.concat(chunks);
  try {
    if (Buffer.isBuffer(req.body)) return req.body;
  } catch {}
  return Buffer.alloc(0);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!passcodeOk(req.headers['x-passcode'])) {
    return res.status(401).json({ error: 'bad_passcode' });
  }
  // GET with a valid passcode lets the app check the passcode without sending audio.
  if (req.method === 'GET') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return res.status(500).json({ error: 'missing_elevenlabs_key' });

  const audio = await readBody(req);
  if (audio === null) return res.status(413).json({ error: 'recording_too_long' });
  if (audio.length < 1000) return res.status(400).json({ error: 'recording_too_short' });

  const type = String(req.headers['content-type'] || 'audio/mp4').split(';')[0].trim();
  const ext = type.includes('webm') ? 'webm' : type.includes('ogg') ? 'ogg' : type.includes('wav') ? 'wav' : 'mp4';

  const form = new FormData();
  form.append('model_id', MODEL);
  form.append('language_code', 'es');
  form.append('tag_audio_events', 'false');
  form.append('timestamps_granularity', 'none');
  form.append('file', new Blob([audio], { type }), `answer.${ext}`);

  try {
    const r = await fetch(STT_URL, { method: 'POST', headers: { 'xi-api-key': key }, body: form });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 500);
      console.error('ElevenLabs speech-to-text failed', r.status, detail);
      return res.status(502).json({ error: 'transcription_failed', status: r.status });
    }
    const data = await r.json();
    return res.status(200).json({ text: typeof data.text === 'string' ? data.text.trim() : '' });
  } catch (e) {
    console.error('ElevenLabs request error', e);
    return res.status(502).json({ error: 'transcription_unreachable' });
  }
}
