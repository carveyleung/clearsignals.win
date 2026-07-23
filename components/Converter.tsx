"use client";

import { useCallback, useRef, useState } from "react";
import { normalizeText, wordCount, estimateMinutes } from "@/lib/textNormalize";
import { chunkText } from "@/lib/chunk";
import { parseFile } from "@/lib/parsers";

const OPENAI_VOICES = [
  "alloy", "ash", "ballad", "coral", "echo",
  "fable", "onyx", "nova", "sage", "shimmer",
];

const ELEVEN_VOICES: { id: string; name: string }[] = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (calm, narration)" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam (deep, narration)" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah (soft)" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh (young male)" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel (British)" },
];

const DEFAULT_INSTRUCTIONS =
  "Read aloud like a professional audiobook narrator. Use a warm, even, natural cadence. " +
  "Phrase complete sentences smoothly and pause only at commas and sentence endings. " +
  "Do not insert unnatural pauses in the middle of a sentence.";

type Provider = "openai" | "elevenlabs";

export default function Converter() {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("audiobook");
  const [provider, setProvider] = useState<Provider>("openai");
  const [openaiVoice, setOpenaiVoice] = useState("alloy");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini-tts");
  const [elevenVoice, setElevenVoice] = useState(ELEVEN_VOICES[0].id);
  const [elevenModel, setElevenModel] = useState("eleven_multilingual_v2");
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);
  const [speed, setSpeed] = useState(1);

  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const cancelled = useRef(false);
  const addLog = (m: string) => setLog((l) => [...l, m]);

  const onFile = useCallback(async (file: File) => {
    setError(null);
    setParsing(true);
    setLog([]);
    try {
      const { text: raw, title: t } = await parseFile(file);
      const clean = normalizeText(raw);
      if (!clean) throw new Error("No readable text was found in that file.");
      setText(clean);
      setTitle(t || "audiobook");
      addLog(`Loaded "${file.name}" - cleaned ${wordCount(clean).toLocaleString()} words.`);
    } catch (e: any) {
      setError(e?.message || "Could not read that file.");
    } finally {
      setParsing(false);
    }
  }, []);

  const cleanCurrent = () => {
    setText((t) => normalizeText(t));
    addLog("Re-cleaned the text (joined soft line breaks, fixed spacing).");
  };

  const generate = async () => {
    setError(null);
    setAudioUrl(null);
    setLog([]);
    const clean = normalizeText(text);
    setText(clean);
    if (!clean.trim()) {
      setError("Add some text or upload a file first.");
      return;
    }

    const maxLen = provider === "openai" ? 3500 : 2500;
    const chunks = chunkText(clean, maxLen);
    addLog(`Split into ${chunks.length} sentence-aligned chunk(s).`);

    cancelled.current = false;
    setBusy(true);
    setProgress(0);

    const buffers: ArrayBuffer[] = [];
    try {
      for (let i = 0; i < chunks.length; i++) {
        if (cancelled.current) {
          addLog("Cancelled.");
          break;
        }
        addLog(`Synthesizing chunk ${i + 1} / ${chunks.length}...`);
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: chunks[i],
            provider,
            voice: provider === "openai" ? openaiVoice : elevenVoice,
            model: provider === "openai" ? openaiModel : elevenModel,
            instructions,
            speed,
          }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({ error: res.statusText }));
          throw new Error(j.error || "Request failed.");
        }
        buffers.push(await res.arrayBuffer());
        setProgress(Math.round(((i + 1) / chunks.length) * 100));
      }

      if (buffers.length && !cancelled.current) {
        const blob = new Blob(buffers, { type: "audio/mpeg" });
        setAudioUrl(URL.createObjectURL(blob));
        addLog("Done. Preview or download your audio below.");
      }
    } catch (e: any) {
      setError(e?.message || "Something went wrong during synthesis.");
    } finally {
      setBusy(false);
    }
  };

  const minutes = estimateMinutes(text);

  return (
    <div className="grid">
      {/* LEFT: source text */}
      <div className="card">
        <div className="card-head">
          <h2>1. Source</h2>
          <div className="head-actions">
            <label className={parsing ? "btn ghost disabled" : "btn ghost"}>
              {parsing ? "Reading..." : "Upload .txt / .pdf / .epub"}
              <input
                type="file"
                accept=".txt,.md,.pdf,.epub,text/plain,application/pdf,application/epub+zip"
                hidden
                disabled={parsing || busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            <button className="btn ghost" onClick={cleanCurrent} disabled={busy}>
              Clean text
            </button>
          </div>
        </div>

        <textarea
          className="editor"
          placeholder="Paste text here, or upload a .txt, .pdf, or .epub file above. You can edit before generating audio."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
        />
        <div className="meta">
          {wordCount(text).toLocaleString()} words - est. {minutes < 1
            ? "<1"
            : Math.round(minutes)}{" "}
          min of audio
        </div>
      </div>

      {/* RIGHT: settings + output */}
      <div className="card">
        <div className="card-head">
          <h2>2. Voice</h2>
        </div>

        <label className="field">
          <span>Provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as Provider)}
            disabled={busy}
          >
            <option value="openai">OpenAI (natural, low cost)</option>
            <option value="elevenlabs">ElevenLabs (most premium)</option>
          </select>
        </label>

        {provider === "openai" ? (
          <>
            <label className="field">
              <span>Model</span>
              <select value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)} disabled={busy}>
                <option value="gpt-4o-mini-tts">gpt-4o-mini-tts (best rhythm)</option>
                <option value="tts-1-hd">tts-1-hd (HD)</option>
                <option value="tts-1">tts-1 (fastest)</option>
              </select>
            </label>
            <label className="field">
              <span>Voice</span>
              <select value={openaiVoice} onChange={(e) => setOpenaiVoice(e.target.value)} disabled={busy}>
                {OPENAI_VOICES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            {openaiModel === "gpt-4o-mini-tts" ? (
              <label className="field">
                <span>Style / rhythm instructions</span>
                <textarea
                  className="mini"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  disabled={busy}
                />
              </label>
            ) : (
              <label className="field">
                <span>Speed: {speed.toFixed(2)}x</span>
                <input
                  type="range" min={0.7} max={1.3} step={0.05}
                  value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  disabled={busy}
                />
              </label>
            )}
          </>
        ) : (
          <>
            <label className="field">
              <span>Model</span>
              <select value={elevenModel} onChange={(e) => setElevenModel(e.target.value)} disabled={busy}>
                <option value="eleven_multilingual_v2">eleven_multilingual_v2 (most natural)</option>
                <option value="eleven_turbo_v2_5">eleven_turbo_v2_5 (fast)</option>
              </select>
            </label>
            <label className="field">
              <span>Voice</span>
              <select value={elevenVoice} onChange={(e) => setElevenVoice(e.target.value)} disabled={busy}>
                {ELEVEN_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </label>
            <p className="hint">
              Tip: paste any voice ID from your ElevenLabs Voice Library into the list in
              <code> components/Converter.tsx</code>.
            </p>
          </>
        )}

        <button className="btn primary block" onClick={generate} disabled={busy || parsing}>
          {busy ? `Generating... ${progress}%` : "Generate audio"}
        </button>
        {busy && (
          <button className="btn ghost block" onClick={() => (cancelled.current = true)}>
            Cancel
          </button>
        )}

        {busy && (
          <div className="bar"><div className="bar-fill" style={{ width: `${progress}%` }} /></div>
        )}

        {error && <div className="alert">{error}</div>}

        {audioUrl && (
          <div className="output">
            <audio controls src={audioUrl} style={{ width: "100%" }} />
            <a className="btn primary block" href={audioUrl} download={`${title || "audio"}.mp3`}>
              Download MP3
            </a>
          </div>
        )}

        {log.length > 0 && (
          <div className="logbox">
            {log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
