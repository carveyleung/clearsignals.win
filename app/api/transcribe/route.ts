import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

// Accepts one audio chunk (multipart/form-data) and returns { text } or { segments }.
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Invalid form data." }, 400);
  }

  const file = form.get("file");
  const provider = String(form.get("provider") || "openai");
  const model = String(form.get("model") || "");
  const language = String(form.get("language") || "").trim();
  const timestamps = String(form.get("timestamps") || "false") === "true";

  if (!(file instanceof Blob)) return json({ error: "No audio file received." }, 400);
  if (file.size > 4_400_000) return json({ error: "Audio chunk too large for the server limit." }, 413);

  try {
    if (provider === "elevenlabs") return await elevenlabs(file, model, language);
    return await openai(file, model, language, timestamps);
  } catch (err: any) {
    return json({ error: err?.message || "Transcription failed." }, 500);
  }
}

async function openai(
  file: Blob,
  model: string,
  language: string,
  timestamps: boolean
): Promise<Response> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: "OPENAI_API_KEY is not set on the server." }, 500);

  // Timestamps/SRT require whisper-1 (verbose_json with segments).
  const useModel = timestamps ? "whisper-1" : model || "gpt-4o-transcribe";

  const fd = new FormData();
  fd.append("file", file, "chunk.wav");
  fd.append("model", useModel);
  if (language) fd.append("language", language);
  fd.append("response_format", timestamps ? "verbose_json" : "json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fd,
  });
  if (!res.ok) {
    return json({ error: `OpenAI STT error (${res.status}): ${await safeErr(res)}` }, res.status);
  }
  const data: any = await res.json();
  if (timestamps && Array.isArray(data.segments)) {
    const segments = data.segments.map((s: any) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    }));
    return json({ text: data.text || "", segments }, 200);
  }
  return json({ text: data.text || "" }, 200);
}

async function elevenlabs(file: Blob, model: string, language: string): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return json({ error: "ELEVENLABS_API_KEY is not set on the server." }, 500);

  const fd = new FormData();
  fd.append("file", file, "chunk.wav");
  fd.append("model_id", model || "scribe_v1");
  if (language) fd.append("language_code", language);

  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": key },
    body: fd,
  });
  if (!res.ok) {
    return json({ error: `ElevenLabs STT error (${res.status}): ${await safeErr(res)}` }, res.status);
  }
  const data: any = await res.json();
  return json({ text: data.text || "" }, 200);
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function safeErr(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 400);
  } catch {
    return res.statusText;
  }
}
