# Listen - Text to Audio & Audio to Text

A self-hostable web app that converts **text/PDF/EPUB to speech** and **audio to text**.
It runs **fully on-device by default - no API keys, no accounts, no per-use cost**. Cloud
providers (OpenAI / ElevenLabs) are optional toggles you can enable with a key. Built with
Next.js 14, deploys on **Vercel** with zero configuration.

## On-device engines (no API)
- **Text to Audio**
  - *System voices* - the browser's built-in speech engine (Web Speech API); uses voices installed on your OS. Instant, offline, plays audio (no file export).
  - *Piper neural* - VITS neural voices via WebAssembly (`@diffusionstudio/vits-web`); model downloads once from a free public CDN, caches, runs offline, and exports a **downloadable WAV**.
- **Audio to Text**
  - *Whisper in-browser* - OpenAI Whisper via Transformers.js (`@xenova/transformers`), WebAssembly; model downloads once, caches, transcribes locally with nothing uploaded.

## Optional cloud engines (need a key)
Add `OPENAI_API_KEY` and/or `ELEVENLABS_API_KEY` in Vercel env vars to unlock:
- TTS: OpenAI `gpt-4o-mini-tts` / `tts-1-hd` / `tts-1`; ElevenLabs `eleven_multilingual_v2`.
- STT: OpenAI `gpt-4o-transcribe` / `whisper-1`; ElevenLabs `scribe_v1`.

## Tabs
- **Text to Audio** - upload `.txt` / `.pdf` / `.epub` (or paste text), pick a voice, generate & download an MP3.
- **Audio to Text** - upload `.mp3` / `.m4a` / `.wav` / `.ogg` / `.webm` / `.flac`, transcribe with premium models, download `.txt` (and `.srt` with timestamps).
- **Setup & Guide** - deployment steps and tips, in-app.

## Deploy to Vercel
1. Create a new GitHub repo and push this folder.
2. Go to [vercel.com](https://vercel.com) - **Add New - Project** - import the repo. Vercel detects Next.js automatically.
3. Add environment variables under **Settings - Environment Variables** (only the provider you use):
   - `OPENAI_API_KEY`
   - `ELEVENLABS_API_KEY`
4. Deploy. That's it.

## Run locally
```bash
cp .env.example .env.local   # add your key(s)
npm install
npm run dev                  # http://localhost:3000
```

## Providers & models
**Text to Audio**
- **OpenAI** - `gpt-4o-mini-tts` (steer cadence via the style-instructions box), plus `tts-1-hd` / `tts-1`. Voices: alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer.
- **ElevenLabs** - most premium. Default voice IDs are included; paste any voice ID from your ElevenLabs Voice Library into `components/Converter.tsx` to add more.

**Audio to Text**
- **OpenAI** - `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `whisper-1` (whisper-1 is used automatically when you enable timestamps/SRT).
- **ElevenLabs** - `scribe_v1`.

## How audio-to-text handles long files
- The file is decoded **in the browser**, downmixed to 16 kHz mono, and sliced into ~60s WAV chunks (< 2 MB each) so every request fits under Vercel's ~4.5 MB serverless body limit.
- Chunk boundaries are nudged to the **quietest nearby point** to avoid cutting words.
- Chunks are transcribed one at a time and stitched together; with timestamps enabled, per-chunk segment times are offset to the global timeline to build a correct `.srt`.

## How the text-to-audio "natural rhythm" works
- **Line-break repair** (`lib/textNormalize.ts`): rejoins soft-wrapped lines, de-hyphenates split words, normalizes quotes/dashes/spacing.
- **Sentence-aligned chunking** (`lib/chunk.ts`): breaks only at `.?!` or paragraph ends, so audio seams fall on natural pauses.
- **Per-chunk synthesis**: the browser sends one chunk at a time to `/api/tts`, then concatenates the MP3s and offers a single download - this also keeps each serverless request well under Vercel's timeout.

## Notes
- Your API key stays server-side (Vercel env var); it is never exposed to the browser.
- Scanned/image-only PDFs have no text layer and cannot be converted (no OCR).
- You pay your chosen provider directly for usage.

## Project structure
```
app/
  layout.tsx          # root layout
  page.tsx            # tabbed shell
  globals.css         # styling
  api/tts/route.ts          # serverless TTS proxy (OpenAI + ElevenLabs)
  api/transcribe/route.ts   # serverless STT proxy (OpenAI + ElevenLabs)
components/
  Converter.tsx       # Text-to-Audio tab
  Transcriber.tsx     # Audio-to-Text tab
  Guide.tsx           # Setup & Guide tab
lib/
  textNormalize.ts    # line-break / punctuation cleanup
  chunk.ts            # sentence-aligned text chunking
  parsers.ts          # .txt / .pdf / .epub extraction (client-side)
  audioChunk.ts       # decode / 16kHz mono resample / silence-aware WAV chunking
```
