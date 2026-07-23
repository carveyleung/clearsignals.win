# Listen - Text to Audio

A minimal, self-hostable web app that turns **text, PDF, and EPUB** files into
natural-sounding audio using premium voices (OpenAI or ElevenLabs). Built with
Next.js 14 and designed to deploy on **Vercel** with zero configuration.

The app is tuned to avoid the classic "weird pauses in the middle of a sentence"
problem: it repairs PDF/EPUB line breaks, fixes hyphenation and spacing, and splits
long text only at sentence/paragraph boundaries so stitched audio has no mid-sentence gaps.

## Tabs
- **Text to Audio** - upload `.txt` / `.pdf` / `.epub` (or paste text), pick a voice, generate & download an MP3.
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

## Providers & voices
- **OpenAI** - model `gpt-4o-mini-tts` (steer cadence via the style-instructions box), plus `tts-1-hd` / `tts-1`. Voices: alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer.
- **ElevenLabs** - most premium. A few default voice IDs are included; paste any voice ID from your ElevenLabs Voice Library into `components/Converter.tsx` to add more.

## How the "natural rhythm" works
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
  api/tts/route.ts    # serverless TTS proxy (OpenAI + ElevenLabs)
components/
  Converter.tsx       # Text-to-Audio tab
  Guide.tsx           # Setup & Guide tab
lib/
  textNormalize.ts    # line-break / punctuation cleanup
  chunk.ts            # sentence-aligned chunking
  parsers.ts          # .txt / .pdf / .epub extraction (client-side)
```
