# Autopilot

A language app built on the FSI drill method: memorise a short real-life dialogue, drill its patterns until the answer comes out on autopilot, without thinking, and review on a spaced schedule. It ships with Spanish (Spain), French, Italian and Thai, and anyone can add a language with an AI-written course file.

**Want your own copy?** Follow [SETUP.md](SETUP.md). No coding needed.

## Features

- Language picker, with separate progress for each language
- Natural recorded audio from ElevenLabs, made once per sentence
- Speech checking: answer out loud and the app transcribes and checks you
- Typing mode with accent buttons
- Pronunciation (romanization) shown under non-Latin scripts, with a show/hide setting
- Variants for sentences that change with the speaker, such as Thai polite particles (khráp / khâ)
- Adjustable pace: 5 to 20 new items a day
- Works as a home-screen app on phones

## How it fits together

| Piece | What it does |
| --- | --- |
| `index.html`, `app.js` | The app. Progress is stored in each browser. |
| `courses/<id>.json` | One file per language: units, dialogues, drills, voice and settings. |
| `courses/index.json` | The language list. Built automatically; don't edit it. |
| `audio/<id>/` | One MP3 per sentence, plus `manifest.json` mapping sentence to file. |
| `scripts/generate-audio.mjs` | Checks every course, builds the language list and records missing audio with each course's voice and model. |
| `scripts/course-tools.mjs` | Course checks and variant expansion, shared by the scripts. |
| `scripts/find-voices.mjs` | Lists ElevenLabs Voice Library voices for a language. |
| `.github/workflows/audio.yml` | Runs the audio script whenever anything in `courses/` changes, and commits the results. |
| `.github/workflows/find-voices.yml` | Run by hand from the Actions tab to find voices. |
| `api/stt.js` | Vercel function for speech checking, using ElevenLabs `scribe_v2` in the course's language. |
| `course-prompt.txt` | The prompt people paste into Claude to write a new course. |

## Settings

- GitHub repository secret `ELEVENLABS_API_KEY`: used by the workflows. Needs Text to Speech and Voices: Read.
- Vercel environment variable `ELEVENLABS_API_KEY` (needs Speech to Text). Optional `APP_PASSCODE`: when set, speech checking asks for it.

## Voice models

Each course sets its own `model`. `eleven_multilingual_v2` covers 29 major languages including Spanish. Thai and many others need `eleven_v4` (or `eleven_v3`, which some voices do not support).
