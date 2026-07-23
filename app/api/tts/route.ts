import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60; // seconds (raise on Vercel Pro if you convert big chunks)

type Body = {
  text: string;
  provider: "openai" | "elevenlabs";
  voice: string;
  model?: string;
  instructions?: string;
  speed?: number;
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid request body." }, 400);
  }

  const text = (body.text || "").trim();
  if (!text) return json({ error: "No text provided." }, 400);
  if (text.length > 5000) return json({ error: "Chunk too long; reduce chunk size." }, 400);

  try {
    if (body.provider === "elevenlabs") return await elevenlabs(body, text);
    return await openai(body, text);
  } catch (err: any) {
    return json({ error: err?.message || "TTS request failed." }, 500);
  }
}

async function openai(body: Body, text: string): Promise<Response> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return json({ error: "OPENAI_API_KEY is not set on the server." }, 500);

  const model = body.model || "gpt-4o-mini-tts";
  const payload: Record<string, unknown> = {
    model,
    voice: body.voice || "alloy",
    input: text,
    response_format: "mp3",
  };

  // gpt-4o-mini-tts steers rhythm via `instructions`; tts-1 / tts-1-hd use `speed`.
  if (model === "gpt-4o-mini-tts") {
    if (body.instructions) payload.instructions = body.instructions;
  } else if (body.speed && body.speed !== 1) {
    payload.speed = body.speed;
  }

  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await safeErr(res);
    return json({ error: `OpenAI TTS error (${res.status}): ${detail}` }, res.status);
  }
  return audio(await res.arrayBuffer());
}

async function elevenlabs(body: Body, text: string): Promise<Response> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return json({ error: "ELEVENLABS_API_KEY is not set on the server." }, 500);

  const voiceId = body.voice || "21m00Tcm4TlvDq8ikWAM"; // Rachel
  const model = body.model || "eleven_multilingual_v2";

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const detail = await safeErr(res);
    return json({ error: `ElevenLabs error (${res.status}): ${detail}` }, res.status);
  }
  return audio(await res.arrayBuffer());
}

function audio(buf: ArrayBuffer): Response {
  return new Response(buf, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function safeErr(res: Response): Promise<string> {
  try {
    const t = await res.text();
    return t.slice(0, 400);
  } catch {
    return res.statusText;
  }
}
