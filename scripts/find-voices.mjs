// Lists popular ElevenLabs Voice Library voices for a language, so you can pick one for a course.
// Usage: ELEVENLABS_API_KEY=... node scripts/find-voices.mjs th [female|male]
const [lang = 'es', gender = ''] = process.argv.slice(2);
const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('ELEVENLABS_API_KEY is not set.'); process.exit(1); }
const q = new URLSearchParams({ language: lang, page_size: '15', sort: 'usage_character_count_1y' });
if (gender) q.set('gender', gender);
const r = await fetch(`https://api.elevenlabs.io/v1/shared-voices?${q}`, { headers: { 'xi-api-key': key } });
if (!r.ok) { console.log(`::error title=Voice search failed::HTTP ${r.status} ${(await r.text()).slice(0, 300)}`); process.exit(1); }
const { voices = [] } = await r.json();
if (!voices.length) console.log(`::warning title=No voices found::No library voices matched language "${lang}".`);
for (const v of voices) {
  const line = [v.name, v.gender, v.age, v.accent, (v.descriptive || v.description || '').slice(0, 80), `uses: ${v.usage_character_count_1y ?? '?'}`, `preview: ${v.preview_url || 'none'}`].filter(Boolean).join(' | ');
  console.log(`::notice title=${v.voice_id}::${line.replace(/[\r\n]+/g, ' ')}`);
}
