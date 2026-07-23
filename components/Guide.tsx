"use client";

export default function Guide() {
  return (
    <div className="card prose">
      <h2>Setup &amp; Guide</h2>

      <h3>1. Deploy in ~2 minutes</h3>
      <ol>
        <li>Push this folder to a new GitHub repository.</li>
        <li>
          On <b>vercel.com</b> - <i>Add New - Project</i> - import the repo. Vercel
          auto-detects Next.js; just click <b>Deploy</b>.
        </li>
        <li>
          In Vercel - <i>Project - Settings - Environment Variables</i>, add the key(s)
          for the provider you want, then redeploy:
          <ul>
            <li><code>OPENAI_API_KEY</code></li>
            <li><code>ELEVENLABS_API_KEY</code></li>
          </ul>
        </li>
      </ol>

      <h3>2. Run locally (optional)</h3>
      <pre>{`cp .env.example .env.local   # add your key(s)
npm install
npm run dev                  # http://localhost:3000`}</pre>

      <h3>3. How to get the most natural rhythm</h3>
      <ul>
        <li>
          <b>Keys are stored server-side.</b> Your API key never reaches the browser -
          it lives in the Vercel environment variables.
        </li>
        <li>
          <b>Line-break repair.</b> PDFs and EPUBs wrap lines mid-sentence, which is the
          usual cause of odd pauses. This app rejoins soft line breaks, fixes hyphenation,
          and normalizes punctuation before sending text to the voice engine.
        </li>
        <li>
          <b>Sentence-aligned chunking.</b> Long text is split only at sentence /
          paragraph endings, so the seams between audio pieces land on a pause that
          already exists - no gaps inside a sentence.
        </li>
        <li>
          <b>Best voice quality:</b> OpenAI <code>gpt-4o-mini-tts</code> (uses the style
          instructions box to steer cadence) or ElevenLabs
          <code> eleven_multilingual_v2</code> for the most premium narration.
        </li>
        <li>
          Always skim the cleaned text on the left and hit <b>Clean text</b> once more
          if you pasted something messy.
        </li>
      </ul>

      <h3>4. Notes &amp; limits</h3>
      <ul>
        <li>Supported inputs: <code>.txt</code>, <code>.md</code>, <code>.pdf</code>, <code>.epub</code>.</li>
        <li>Scanned/image-only PDFs have no text layer and cannot be read (would need OCR).</li>
        <li>
          Very long books make many API calls. On Vercel Hobby the function timeout is
          short; the app converts one chunk per request from the browser to stay within
          limits. For big files consider Vercel Pro and raise <code>maxDuration</code> in
          <code> app/api/tts/route.ts</code>.
        </li>
        <li>You pay your provider directly for usage; there is no cost baked into the app.</li>
      </ul>
    </div>
  );
}
