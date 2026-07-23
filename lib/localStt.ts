// On-device speech-to-text using Transformers.js (Whisper) in the browser.
// No API key. The model downloads once from a free public CDN, is cached, then
// runs offline via WebAssembly. Long audio is chunked internally by the pipeline.

let cache: Record<string, any> = {};

export type LocalSttResult = {
  text: string;
  chunks?: { start: number; end: number; text: string }[];
};

export async function transcribeLocal(
  audio16k: Float32Array,
  opts: {
    model?: string;
    timestamps?: boolean;
    language?: string;
    onStatus?: (msg: string) => void;
  } = {}
): Promise<LocalSttResult> {
  const model = opts.model || "Xenova/whisper-base";
  const { pipeline, env } = await import("@xenova/transformers");
  // Pull models/weights from the hub CDN (no local model files bundled).
  env.allowLocalModels = false;

  if (!cache[model]) {
    opts.onStatus?.("Loading model (first run downloads & caches it)...");
    cache[model] = await pipeline("automatic-speech-recognition", model, {
      progress_callback: (p: any) => {
        if (p?.status === "progress" && p?.file) {
          opts.onStatus?.(`Downloading ${p.file}: ${Math.round(p.progress || 0)}%`);
        } else if (p?.status) {
          opts.onStatus?.(String(p.status));
        }
      },
    });
  }

  const transcriber = cache[model];
  opts.onStatus?.("Transcribing on-device...");
  const out: any = await transcriber(audio16k, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: !!opts.timestamps,
    language: opts.language || undefined,
    task: "transcribe",
  });

  const text: string = (out?.text || "").trim();
  let chunks;
  if (opts.timestamps && Array.isArray(out?.chunks)) {
    chunks = out.chunks
      .filter((c: any) => Array.isArray(c.timestamp))
      .map((c: any) => ({
        start: c.timestamp[0] ?? 0,
        end: c.timestamp[1] ?? c.timestamp[0] ?? 0,
        text: (c.text || "").trim(),
      }));
  }
  return { text, chunks };
}
