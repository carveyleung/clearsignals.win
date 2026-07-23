// On-device text-to-speech. No API keys, no server calls.
//
// Two local engines:
//  1) "system"  - the browser's built-in speechSynthesis (Web Speech API). Instant,
//                 zero download, uses the voices installed on your OS. Great for
//                 listening; browsers don't expose a reliable audio buffer, so this
//                 engine plays audio but does not export a file.
//  2) "piper"   - Piper neural voices (VITS) running fully in-browser via WebAssembly
//                 (@diffusionstudio/vits-web). The voice model downloads once from a
//                 free public CDN, is cached in the browser, then runs offline. This
//                 engine returns a downloadable WAV.

// ---------------- Web Speech (system voices) ----------------

export function systemVoicesSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function getSystemVoices(): SpeechSynthesisVoice[] {
  if (!systemVoicesSupported()) return [];
  return window.speechSynthesis.getVoices();
}

// Voice list can populate asynchronously on first load.
export function onSystemVoices(cb: (v: SpeechSynthesisVoice[]) => void): () => void {
  if (!systemVoicesSupported()) return () => {};
  const handler = () => cb(window.speechSynthesis.getVoices());
  window.speechSynthesis.addEventListener("voiceschanged", handler);
  handler();
  return () => window.speechSynthesis.removeEventListener("voiceschanged", handler);
}

export type SpeakOpts = {
  voiceURI?: string;
  rate?: number;
  pitch?: number;
  onProgress?: (done: number, total: number) => void;
  onDone?: () => void;
  onError?: (msg: string) => void;
};

// Speaks one sentence per utterance so pauses only fall at sentence ends.
export function speakSystem(sentences: string[], opts: SpeakOpts): () => void {
  const synth = window.speechSynthesis;
  synth.cancel();
  const voices = synth.getVoices();
  const voice = opts.voiceURI ? voices.find((v) => v.voiceURI === opts.voiceURI) : undefined;
  let done = 0;

  sentences.forEach((s, i) => {
    const u = new SpeechSynthesisUtterance(s);
    if (voice) u.voice = voice;
    u.rate = opts.rate ?? 1;
    u.pitch = opts.pitch ?? 1;
    u.onend = () => {
      done += 1;
      opts.onProgress?.(done, sentences.length);
      if (i === sentences.length - 1) opts.onDone?.();
    };
    u.onerror = (e) => opts.onError?.(e.error || "speech error");
    synth.speak(u);
  });

  return () => synth.cancel();
}

export function pauseSystem() { window.speechSynthesis?.pause(); }
export function resumeSystem() { window.speechSynthesis?.resume(); }

// ---------------- Piper (neural, in-browser, downloadable) ----------------

let piperMod: any = null;
async function piper(): Promise<any> {
  if (!piperMod) piperMod = await import("@diffusionstudio/vits-web");
  return piperMod;
}

export type PiperVoice = { key: string; name: string; language?: string; quality?: string };

export async function listPiperVoices(): Promise<PiperVoice[]> {
  const t = await piper();
  const raw = await t.voices();
  // Normalize across package versions.
  return (raw || []).map((v: any) => ({
    key: v.key ?? v.id ?? v.voiceId ?? String(v),
    name: v.name ?? v.key ?? "voice",
    language: v.language?.name_native ?? v.language?.code ?? v.language,
    quality: v.quality,
  }));
}

export async function piperStored(): Promise<string[]> {
  try {
    const t = await piper();
    return (await t.stored()) || [];
  } catch {
    return [];
  }
}

export async function downloadPiperVoice(
  voiceId: string,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const t = await piper();
  await t.download(voiceId, (p: any) => {
    const frac = p && p.total ? p.loaded / p.total : 0;
    onProgress?.(frac);
  });
}

// Synthesizes each (sentence-aligned) block and merges into one WAV.
export async function piperSynthesize(
  blocks: string[],
  voiceId: string,
  onBlock?: (done: number, total: number) => void
): Promise<Blob> {
  const t = await piper();
  const wavs: ArrayBuffer[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const out = await t.predict({ text: blocks[i], voiceId });
    const blob: Blob = out instanceof Blob ? out : new Blob([out], { type: "audio/wav" });
    wavs.push(await blob.arrayBuffer());
    onBlock?.(i + 1, blocks.length);
  }
  return mergeWav(wavs);
}

// ---- WAV merge (Piper voices share one format, so we concat PCM + one header) ----

function readWav(buf: ArrayBuffer): {
  sampleRate: number; channels: number; bits: number; pcm: Uint8Array;
} {
  const dv = new DataView(buf);
  let offset = 12; // skip RIFF____WAVE
  let sampleRate = 22050, channels = 1, bits = 16;
  let dataOffset = 44, dataLen = buf.byteLength - 44;
  while (offset + 8 <= dv.byteLength) {
    const id = String.fromCharCode(
      dv.getUint8(offset), dv.getUint8(offset + 1),
      dv.getUint8(offset + 2), dv.getUint8(offset + 3)
    );
    const size = dv.getUint32(offset + 4, true);
    if (id === "fmt ") {
      channels = dv.getUint16(offset + 10, true);
      sampleRate = dv.getUint32(offset + 12, true);
      bits = dv.getUint16(offset + 22, true);
    } else if (id === "data") {
      dataOffset = offset + 8;
      dataLen = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }
  return { sampleRate, channels, bits, pcm: new Uint8Array(buf, dataOffset, Math.min(dataLen, buf.byteLength - dataOffset)) };
}

function mergeWav(buffers: ArrayBuffer[]): Blob {
  if (buffers.length === 0) return new Blob([], { type: "audio/wav" });
  const parts = buffers.map(readWav);
  const { sampleRate, channels, bits } = parts[0];
  const totalPcm = parts.reduce((n, p) => n + p.pcm.length, 0);
  const header = new ArrayBuffer(44);
  const dv = new DataView(header);
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  const byteRate = (sampleRate * channels * bits) / 8;
  writeStr(0, "RIFF");
  dv.setUint32(4, 36 + totalPcm, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, (channels * bits) / 8, true);
  dv.setUint16(34, bits, true);
  writeStr(36, "data");
  dv.setUint32(40, totalPcm, true);
  return new Blob([header, ...parts.map((p) => p.pcm)], { type: "audio/wav" });
}
