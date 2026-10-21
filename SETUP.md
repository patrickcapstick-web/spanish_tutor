# Run your own Autopilot

This guide sets up your own copy of the app, with your own languages and voices. No coding is needed. It takes about 30 minutes.

## What you need

| Account | What it's for | Cost |
| --- | --- | --- |
| [GitHub](https://github.com) | Stores the app and makes the recordings | Free |
| [Vercel](https://vercel.com) | Puts the app online at its own web address | Free |
| [ElevenLabs](https://elevenlabs.io) | Natural voices and speech checking | Starter plan, about $6 a month (the free plan can't use most voices through the API) |

A full 8-unit course needs roughly 3,000 to 6,000 characters of audio, a small part of the Starter plan's monthly allowance. Recordings are made once and kept. Speech checking uses a little more each time someone answers out loud.

## 1. Copy the app

1. Open the [Autopilot repository](https://github.com/patrickcapstick-web/spanish_tutor).
2. Click **Use this template**, then **Create a new repository**.
3. Give it a name, for example `my-language-app`, and click **Create repository**.

Your copy includes the Spanish, French, Italian, Japanese and Thai courses and their recordings.

## 2. Get an ElevenLabs API key

1. Sign in to ElevenLabs and go to **Settings → API Keys** ([direct link](https://elevenlabs.io/app/settings/api-keys)).
2. Click **Create key** and name it after your app.
3. Turn on these permissions: **Text to Speech**, **Speech to Text** and **Voices: Read**.
4. Click **Create key** and copy it straight away. It starts with `sk_` and is shown only once. Keep it private: anyone with it can spend your credits.

## 3. Give the key to GitHub

1. In your new repository, open **Settings → Secrets and variables → Actions**.
2. Click **New repository secret**.
3. Name: `ELEVENLABS_API_KEY`. Secret: paste your `sk_` key. Click **Add secret**.

## 4. Put the app online with Vercel

1. Sign in to Vercel with your GitHub account.
2. Click **Add New → Project** and **Import** your repository.
3. Open **Environment Variables** and add `ELEVENLABS_API_KEY` with your `sk_` key.
   - Optional: add `APP_PASSCODE` with a passcode you make up, for example `tapas-and-tuk-tuks`. With it, people must enter the passcode before speech checking works. Without it, anyone with your web address can use speech checking, and each answer they say uses a little of your ElevenLabs credits.
4. Click **Deploy**. After a minute you get a web address like `my-language-app.vercel.app`. That's your app.

## 5. Check it works

1. Open your address. You should see the language list.
2. Pick a language. Under **Settings** it should say "Speech checking is on" (if you set a passcode, enter it there first).
3. Start a session, answer a drill out loud and check that you see "You said: …".

If speech checking fails, open your project in Vercel, go to **Logs**, and look for a line starting `ElevenLabs speech-to-text failed`. It says what ElevenLabs refused, usually a missing permission on the key.

## 6. Add a language

1. **Write the course.** Open the app's **Guide** tab, tap **Copy the course prompt**, paste it into [Claude](https://claude.ai) and fill in the first four lines. Claude replies with a course file. Save it with the name Claude gives you, such as `ja.json`.
2. **Find a voice.** In your repository, go to **Actions → Find voices → Run workflow**. Type the language code (for example `ja`) and click **Run workflow**. When it finishes, open the run: each voice is listed with its ID, accent and a preview link. You can also browse the [ElevenLabs Voice Library](https://elevenlabs.io/app/voice-library) and filter by language; each voice has a **Copy voice ID** option.
3. **Add the voice to the file.** Open your course file in any text editor and replace `PASTE_VOICE_ID` with the voice ID.
4. **Upload it.** In your repository, open the `courses` folder, click **Add file → Upload files**, drop in your file and click **Commit changes**.
5. **Wait about five minutes.** GitHub checks the file, makes every recording and adds the language to the app's list. Watch progress under the **Actions** tab. A green tick means it worked. A red cross means something needs fixing: open the run, and the problem is listed in plain words at the top, for example "The file name must match the id".

To change a course later, edit the file on GitHub (open it and click the pencil icon) and commit. Only new or changed sentences are recorded again.

## 7. Share it

Send people your web address (and the passcode, if you set one). To open the app straight on a language, add `#` and the course code to the address, for example `my-language-app.vercel.app/#th`. On a phone, they can add it to the home screen from the browser's **Share** or menu button.

Progress is saved on each person's own device and browser.

## Good to know

- **Course quality:** AI-written courses are a strong start, not a guarantee. If you can, have a native speaker look over each course, especially the dialogues.
- **Changing a voice:** edit `voice` in the course file and commit. The whole course is recorded again with the new voice.
- **Removing a language:** delete its file from the `courses` folder. Its recordings are removed on the next run.
