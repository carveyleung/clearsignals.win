"use client";

export default function Guide() {
  return (
    <div className="card prose">
      <h2>Setup &amp; Guide</h2>

      <h3>Runs with no API key</h3>
      <p>
        By default this app works <b>fully on-device</b> - no accounts, no API keys, no
        per-use cost. Cloud engines (OpenAI / ElevenLabs) are optional extras you can
        switch on only if you add their keys.
      </p>

      <h3>1. Deploy in ~2 minutes</h3>
      <ol>
        <li>Push this folder to a new GitHub repository.</li>
        <li>On <b>vercel.com</b> - <i>Add New - Project</i> - import the repo - <b>Deploy</b>. That's it - no environment variables needed for the on-device engines.</li>
        <li>(Optional) To enable the cloud engines, add <code>OPENAI_API_KEY</code> and/or <code>ELEVENLABS_API_KEY</code> under <i>Settings - Environment Variables</i> and redeploy.</li>
      </ol>

      <h3>2. Run locally (optional)</h3>
      <pre>{`npm install
npm run dev     # http://localhost:3000`}</pre>

      <h3>3. Text to Audio - on-device voices</h3>
      <ul>
        <li><b>System voices (instant):</b> uses the voices already installed on your operating system via the browser's speech engine. Zero download, plays immediately, never leaves your device. (Browsers don't expose a saveable buffer here, so this engine plays audio but doesn't export a file.)</li>
        <li><b>Piper neural (downloadable):</b> high-quality neural voices (VITS) that run in your browser through WebAssembly. The chosen voice's model downloads once from a free public CDN, caches in the browser, then runs offline - and produces a downloadable WAV.</li>
        <li><b>Natural rhythm:</b> for every engine the text is de-hyphenated, soft line breaks are rejoined, and it is split only at sentence/paragraph boundaries - so there are no odd pauses in the middle of sentences.</li>
        <li><b>Cloud (optional):</b> OpenAI or ElevenLabs, only if you added a key.</li>
      </ul>

      <h3>4. Audio to Text - on-device transcription</h3>
      <ul>
        <li><b>Whisper in-browser (default):</b> runs OpenAI's Whisper model locally via Transformers.js (WebAssembly). The model downloads once from a free public CDN, caches, then transcribes with nothing uploaded anywhere.</li>
        <li>Pick <code>whisper-tiny</code> (fastest), <code>whisper-base</code> (balanced), or <code>whisper-small</code> (most accurate).</li>
        <li>Enable <b>Timestamps + SRT export</b> for subtitles; add a language hint for a small accuracy boost.</li>
        <li><b>Cloud (optional):</b> OpenAI / ElevenLabs, only if you added a key.</li>
      </ul>

      <h3>5. Notes</h3>
      <ul>
        <li>On-device engines need a modern browser. Neural TTS and Whisper are fastest on Chrome/Edge; performance scales with your machine.</li>
        <li>Model files (voices, Whisper) are downloaded once from a public CDN and cached - after that they work with no network. No API key is ever involved.</li>
        <li>Scanned/image-only PDFs have no text layer (would need OCR).</li>
        <li>Transcription decodes the whole file in the browser first; very long recordings use significant memory.</li>
      </ul>
    </div>
  );
}
