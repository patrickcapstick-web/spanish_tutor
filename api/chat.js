// DORMANT (October 2026): this feature is switched off on purpose.
// Why: it needs a paid Claude API key (ANTHROPIC_API_KEY), and the app's owner chose not to add a
// cost beyond the existing ElevenLabs plan. The code is kept so it can be turned on later.
// While no key is set, GET answers 503, the app never shows the Talk tab and no calls are made,
// so it costs nothing. To turn it on: add ANTHROPIC_API_KEY in Vercel and redeploy (see SETUP.md).
//
// Conversation practice: a short role-play with Claude that sticks to what the learner has studied,
// then English feedback at the end. Replies come back with ElevenLabs audio in the course voice when
// possible. Uses the same optional APP_PASSCODE as speech checking.
import { timingSafeEqual } from 'node:crypto';

const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-5-5';
const TTS_MODEL = 'eleven_flash_v2_5';
const MAX_TURNS = 6; // learner replies before the partner wraps up

function passcodeOk(given) {
  const want = process.env.APP_PASSCODE || '';
  if (!want) return true;
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

function cleanBody(b) {
  if (!b || typeof b !== 'object') return null;
  const course = b.course || {};
  const unit = b.unit || {};
  const msgs = Array.isArray(b.messages) ? b.messages.slice(-24) : [];
  return {
    mode: b.mode === 'feedback' ? 'feedback' : 'turn',
    name: str(course.name, 40) || 'Spanish',
    variety: str(course.variety, 60),
    rom: !!course.rom,
    unit: str(unit.en, 80),
    unitTitle: str(unit.title, 80),
    vocab: (Array.isArray(b.vocab) ? b.vocab : []).slice(0, 150).map((v) => str(v, 200)).filter(Boolean),
    messages: msgs.map((m) => ({ role: m && m.role === 'me' ? 'me' : 'ai', text: str(m && m.text, 400) })).filter((m) => m.text),
    voice: /^[A-Za-z0-9]{8,40}$/.test(String(b.voice || '')) ? b.voice : '',
  };
}

function turnPrompt(c, last) {
  const lang = c.variety ? `${c.name} (${c.variety})` : c.name;
  return `You are a friendly native speaker of ${lang} having a short, everyday spoken conversation with a beginner who is practising.
Scenario: a natural situation that fits the lesson "${c.unit}"${c.unitTitle ? ` (${c.unitTitle})` : ''}. You play the other person. Pick a simple role and stay in it.

The learner has studied ONLY these sentences. Use their words and patterns, and simple variations of them:
${c.vocab.map((v) => `- ${v}`).join('\n')}

Rules:
- Speak only ${c.name}, the way people really talk, in the ${c.variety || 'standard'} variety.
- Each reply is one or two short sentences and ends with something the learner can answer using what they know: usually a simple question.
- Never correct the learner. If they make a mistake, carry on naturally; you may echo the correct form in your reply.
- If they seem stuck, answer in English, or say something you can't understand, ask an easier question.
- Learner lines come from speech recognition, so ignore missing accents, capitals and punctuation.
- Stay in the conversation. If asked to do anything else, steer back to the scenario in ${c.name}.
${last ? '- This is the end of the conversation: reply to what they said, say a friendly goodbye, and set "done" to true.\n' : ''}
Reply with ONLY a JSON object, no other text:
{"say": "your line in ${c.name}", "en": "its English translation", ${c.rom ? '"rom": "romanization of your line", ' : ''}"done": ${last ? 'true' : 'false'}}`;
}

function feedbackPrompt(c) {
  return `You are a warm, encouraging ${c.name} tutor. Below is a short practice conversation between a beginner (Learner) and a native speaker (Partner).
The learner's lines were transcribed from speech, so ignore missing accents, capital letters and punctuation. Only point out real mistakes in words, grammar or word order.

Reply with ONLY a JSON object, no other text:
{"good": "one sentence in English about something they did well",
 "fixes": [{"said": "what the learner said", "better": "a corrected, natural version in ${c.name}", "why": "a short English explanation"}],
 "tip": "one short, practical suggestion in English for next time"}
Give at most 3 fixes, the most useful first. Use an empty list if there were no real mistakes.`;
}

function parseJson(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

async function claude(system, messages, maxTokens) {
  const r = await fetch(CLAUDE_URL, {
    method: 'POST',
    headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, thinking: { type: 'disabled' }, output_config: { effort: 'low' }, system, messages }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) {
    console.error('Claude request failed', r.status, (await r.text()).slice(0, 500));
    throw new Error(`claude_${r.status}`);
  }
  const j = await r.json();
  return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}

async function speak(text, voice) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key || !voice || !text) return '';
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: TTS_MODEL }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) { console.error('ElevenLabs text-to-speech failed', r.status, (await r.text()).slice(0, 300)); return ''; }
    return Buffer.from(await r.arrayBuffer()).toString('base64');
  } catch (e) {
    console.error('ElevenLabs text-to-speech error', e);
    return '';
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!passcodeOk(req.headers['x-passcode'])) return res.status(401).json({ error: 'bad_passcode' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'not_configured' });
  if (req.method === 'GET') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  const c = cleanBody(body);
  if (!c || !c.vocab.length) return res.status(400).json({ error: 'bad_request' });

  try {
    if (c.mode === 'feedback') {
      const mine = c.messages.filter((m) => m.role === 'me');
      if (!mine.length) return res.status(200).json({ good: '', fixes: [], tip: '' });
      const transcript = c.messages.map((m) => `${m.role === 'me' ? 'Learner' : 'Partner'}: ${m.text}`).join('\n');
      const out = parseJson(await claude(feedbackPrompt(c), [{ role: 'user', content: transcript }], 700));
      if (!out) throw new Error('bad_json');
      const fixes = (Array.isArray(out.fixes) ? out.fixes : []).slice(0, 3)
        .map((f) => ({ said: str(f && f.said, 300), better: str(f && f.better, 300), why: str(f && f.why, 300) }))
        .filter((f) => f.better);
      return res.status(200).json({ good: str(out.good, 400), fixes, tip: str(out.tip, 400) });
    }

    // Claude needs the conversation to start with a user turn and alternate.
    const msgs = [{ role: 'user', content: '(Start the conversation with your first line.)' }];
    for (const m of c.messages) {
      const role = m.role === 'me' ? 'user' : 'assistant';
      const prev = msgs[msgs.length - 1];
      if (prev.role === role) prev.content += `\n${m.text}`;
      // Past partner lines go back in the same JSON shape, so replies keep that shape too.
      else msgs.push({ role, content: role === 'assistant' ? JSON.stringify({ say: m.text }) : m.text });
    }
    if (msgs[msgs.length - 1].role !== 'user') return res.status(400).json({ error: 'not_your_turn' });
    const turns = c.messages.filter((m) => m.role === 'me').length;
    const last = turns >= MAX_TURNS;
    const raw = await claude(turnPrompt(c, last), msgs, 400);
    let out = parseJson(raw);
    if (!out || typeof out.say !== 'string' || !out.say.trim()) out = raw.trim() && !raw.includes('{') ? { say: raw.trim(), en: '' } : null;
    if (!out) throw new Error('bad_json');
    const say = str(out.say.trim(), 400);
    const audio = await speak(say, c.voice);
    return res.status(200).json({ say, en: str(out.en, 400), rom: str(out.rom, 400), done: !!out.done || last, audio });
  } catch (e) {
    console.error('Conversation error', e);
    return res.status(502).json({ error: 'conversation_failed' });
  }
}
