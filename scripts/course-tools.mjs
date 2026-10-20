// Shared helpers for course files: listing the sentences that need audio,
// expanding variant tokens such as {p}, and checking a course for mistakes.

// Every sentence the app can play: dialogue lines, drill prompts and model answers.
export function sentencesOf(course) {
  const out = [];
  for (const unit of course.units) {
    for (const line of unit.dialogue) out.push(line.target);
    for (const group of unit.drills) {
      for (const item of group.items) {
        if (item.base) out.push(item.base);
        out.push(item.answers[0]);
      }
    }
  }
  return out;
}

// A sentence with tokens like {p} becomes one version per variant option.
export function expandVariants(course, text) {
  const opts = course.variants && course.variants.options;
  if (!opts || !/\{[^}]+\}/.test(text)) return [text];
  return [...new Set(opts.map((o) => applyReplace(text, o.replace)))];
}

export function applyReplace(text, map) {
  if (!map || typeof text !== 'string') return text;
  return text.replace(/\{[^}]+\}/g, (tok) => (tok in map ? map[tok] : tok));
}

const KINDS = ['sub', 'xf', 'tr'];

// Returns a list of plain-language problems. An empty list means the course is usable.
export function validateCourse(c, file = 'course') {
  const p = [];
  const need = (cond, msg) => { if (!cond) p.push(msg); };
  need(c && typeof c === 'object', 'The file must contain one JSON object.');
  if (!c || typeof c !== 'object') return p;
  need(/^[a-z0-9-]{2,20}$/.test(c.id || ''), '"id" must be a short lowercase code such as "th" or "fr".');
  need(file === `${c.id}.json`, `The file name must match the id: name it ${c.id}.json.`);
  need(typeof c.name === 'string' && c.name, '"name" is missing (for example "Thai").');
  need(typeof c.voice === 'string' && c.voice && c.voice !== 'PASTE_VOICE_ID', '"voice" is missing: add an ElevenLabs voice ID (see SETUP.md, step 6).');
  need(typeof c.speechLanguage === 'string' && c.speechLanguage, '"speechLanguage" is missing (a code such as "th").');
  need(Array.isArray(c.units) && c.units.length, '"units" must be a list with at least one unit.');
  if (c.variants) {
    const o = c.variants.options;
    need(Array.isArray(o) && o.length >= 2, '"variants.options" needs at least two options.');
    (o || []).forEach((v, i) => need(v.id && v.label && v.replace, `Variant option ${i + 1} needs "id", "label" and "replace".`));
  }
  const ids = new Set();
  (c.units || []).forEach((u, ui) => {
    const where = `Unit ${ui + 1}`;
    need(u.id && !ids.has(u.id), `${where} needs a unique "id".`);
    ids.add(u.id);
    need(u.title, `${where} needs a "title".`);
    need(Array.isArray(u.dialogue) && u.dialogue.length, `${where} needs a "dialogue" list.`);
    (u.dialogue || []).forEach((d, i) => need(d.target && d.en, `${where}, dialogue line ${i + 1} needs "target" and "en".`));
    need(Array.isArray(u.drills), `${where} needs a "drills" list (it can be empty).`);
    (u.drills || []).forEach((g, gi) => {
      const gw = `${where}, drill ${gi + 1}`;
      need(KINDS.includes(g.kind), `${gw}: "kind" must be "sub", "xf" or "tr".`);
      need(g.instruction, `${gw} needs an "instruction".`);
      (g.items || []).forEach((it, ii) => {
        const iw = `${gw}, item ${ii + 1}`;
        need(Array.isArray(it.answers) && it.answers.length && it.answers.every((a) => typeof a === 'string' && a), `${iw} needs a list of "answers".`);
        if (g.kind === 'tr') need(it.en, `${iw} needs "en" (the English to translate).`);
        else need(it.base, `${iw} needs "base" (the sentence to change).`);
      });
    });
  });
  return p;
}
