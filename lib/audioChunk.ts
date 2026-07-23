// Decodes any browser-playable audio file, downmixes to 16 kHz mono, and slices it
// into small WAV chunks. Two reasons this matters:
//  1) Vercel serverless functions cap the request body at ~4.5 MB. A 60s 16 kHz mono
//     WAV is < 2 MB, so every chunk fits comfortably.
//  2) 16 kHz mono is exactly what speech-to-text models expect -> best accuracy.
// Chunk boundaries are nudged to the quietest point nearby so we rarely cut a word.

export type AudioChunk = { blob: Blob; startSec: number; endSec: number };

const TARGET_RATE = 16000;
const CHUNK_SECONDS = 60;
const SEARCH_SECONDS = 2; // window (+/-) to hunt for a silent cut point

export async function chunkAudio(
  file: File,
  onProgress?: (msg: string) => void
): Promise<AudioChunk[]> {
  onProgress?.("Decoding audio...");
  const AC: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  ctx.close();

  onProgress?.("Resampling to 16 kHz mono...");
  const mono = await toMono16k(decoded);

  const chunkLen = CHUNK_SECONDS * TARGET_RATE;
  const searchLen = SEARCH_SECONDS * TARGET_RATE;
  const chunks: AudioChunk[] = [];

  let start = 0;
  while (start < mono.length) {
    let end = Math.min(start + chunkLen, mono.length);
    if (end < mono.length) end = quietestCut(mono, end, searchLen);
    const slice = mono.subarray(start, end);
    chunks.push({
      blob: encodeWav(slice, TARGET_RATE),
      startSec: start / TARGET_RATE,
      endSec: end / TARGET_RATE,
    });
    start = end;
  }
  onProgress?.(`Prepared ${chunks.length} audio chunk(s).`);
  return chunks;
}

// Decode any browser-playable audio to a 16 kHz mono Float32Array (for local STT).
export async function decodeTo16kMono(file: File): Promise<Float32Array> {
  const AC: typeof AudioContext =
    (window as any).AudioContext || (window as any).webkitAudioContext;
  const ctx = new AC();
  const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
  ctx.close();
  return toMono16k(decoded);
}

async function toMono16k(buffer: AudioBuffer): Promise<Float32Array> {
  const OAC: typeof OfflineAudioContext =
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const length = Math.max(1, Math.ceil((buffer.duration * TARGET_RATE)));
  const offline = new OAC(1, length, TARGET_RATE); // 1 channel -> auto downmix to mono
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

// Find the lowest-energy 25 ms window within +/- searchLen of `target`.
function quietestCut(data: Float32Array, target: number, searchLen: number): number {
  const win = Math.floor(TARGET_RATE * 0.025);
  const from = Math.max(win, target - searchLen);
  const to = Math.min(data.length - win, target + searchLen);
  if (to <= from) return target;
  let best = target;
  let bestEnergy = Infinity;
  const step = Math.max(1, Math.floor(win / 2));
  for (let i = from; i < to; i += step) {
    let e = 0;
    for (let j = i; j < i + win; j++) e += data[j] * data[j];
    if (e < bestEnergy) {
      bestEnergy = e;
      best = i + Math.floor(win / 2);
    }
  }
  return best;
}

// 16-bit PCM WAV encoder.
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits/sample
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

// ---- transcript helpers ----
export type Segment = { start: number; end: number; text: string };

export function buildSrt(segments: Segment[]): string {
  return segments
    .map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text.trim()}\n`)
    .join("\n");
}

function srtTime(sec: number): string {
  const ms = Math.floor((sec % 1) * 1000);
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}
