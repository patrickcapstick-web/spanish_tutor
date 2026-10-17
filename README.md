# Sin Pensar

A small web app for learning conversational Spain Spanish with the FSI drill method: memorise a short dialogue, drill its patterns until the answer comes out without thinking, and review on a spaced schedule.

## How it fits together

| Piece | What it does |
| --- | --- |
| `index.html`, `app.js` | The app. Progress is stored in the browser on each device. |
| `course.json` | All units, dialogues and drills. Edit this to add content. |
| `audio/` | One MP3 per Spanish sentence, plus `manifest.json` mapping sentence to file. |
| `scripts/generate-audio.mjs` | Creates missing MP3s with ElevenLabs (voice `rixsIpPlTphvsJd2mI03`, model `eleven_multilingual_v2`). |
| `.github/workflows/audio.yml` | Runs the script and commits new audio whenever `course.json` changes on `main`, or on demand from the Actions tab. |
| `api/stt.js` | Vercel function for speech checking. Sends a recording to ElevenLabs speech-to-text (`scribe_v2`, Spanish) and returns the transcript. |

## Settings

- GitHub repository secret `ELEVENLABS_API_KEY`: used by the audio workflow.
- Vercel environment variables `ELEVENLABS_API_KEY` and `APP_PASSCODE`: used by `api/stt.js`. The app asks for the passcode once per device before speech checking is turned on.

## Adding content

Add a unit to `course.json` and push. The workflow generates audio for the new sentences only, commits it and Vercel redeploys.
