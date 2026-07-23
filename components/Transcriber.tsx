"use client";

import { useRef, useState } from "react";
import { chunkAudio, decodeTo16kMono, buildSrt, Segment } from "@/lib/audioChunk";
import { transcribeLocal } from "@/lib/localStt";

type Engine = "local" | "openai" | "elevenlabs";

export default function Transcriber() {
  const [engine, setEngine] = useState<Engine>("local");
  const [localModel, setLocalModel] = useState("Xenova/whisper-base");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-transcribe");
  const [language, setLanguage] = useState("");
  const [timestamps, setTimestamps] = useState(false);

  const [fileName, setFileName] = useState("transcript");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [srt, setSrt] = useState("");

  const cancelled = useRef(false);
  const addLog = (m: string) => setLog((l) => [...l, m]);

  const run = async (file: File) => {
    setError(null); setTranscript(""); setSrt(""); setLog([]); setProgress(0);
    setFileName(file.name.replace(/\.[^.]+$/, "") || "transcript");
    cancelled.current = false; setBusy(true);

    try {
      if (engine === "local") {
        addLog("Decoding audio to 16 kHz mono...");
        const audio = await decodeTo16kMono(file);
        const res = await transcribeLocal(audio, {
          model: localModel,
          timestamps,
          language: language.trim() || undefined,
          onStatus: (m) => addLog(m),
        });
        setTranscript(res.text);
        if (timestamps && res.chunks?.length) {
          const segs: Segment[] = res.chunks.map((c) => ({ start: c.start, end: c.end, text: c.text }));
          setSrt(buildSrt(segs));
        }
        setProgress(100);
        addLog("Done - fully on-device, no data left your browser.");
      } else {
        // cloud (optional)
        const useTs = timestamps && engine === "openai";
        const chunks = await chunkAudio(file, addLog);
        const textParts: string[] = [];
        const allSegments: Segment[] = [];
        for (let i = 0; i < chunks.length; i++) {
          if (cancelled.current) { addLog("Cancelled."); break; }
          addLog(`Cloud chunk ${i + 1}/${chunks.length}...`);
          const fd = new FormData();
          fd.append("file", chunks[i].blob, `chunk-${i}.wav`);
          fd.append("provider", engine);
          fd.append("model", engine === "openai" ? openaiModel : "scribe_v1");
          fd.append("language", language.trim());
          fd.append("timestamps", String(useTs));
          const res = await fetch("/api/transcribe", { method: "POST", body: fd });
          if (!res.ok) { const j = await res.json().catch(() => ({error: res.statusText})); throw new Error(j.error); }
          const data = await res.json();
          if (data.text) textParts.push(String(data.text).trim());
          if (useTs && Array.isArray(data.segments)) {
            for (const s of data.segments as Segment[]) allSegments.push({ start: s.start + chunks[i].startSec, end: s.end + chunks[i].startSec, text: s.text });
          }
          setProgress(Math.round(((i + 1) / chunks.length) * 100));
        }
        if (!cancelled.current) {
          setTranscript(textParts.join(" ").replace(/\s+/g, " ").trim());
          if (useTs && allSegments.length) setSrt(buildSrt(allSegments));
          addLog("Done.");
        }
      }
    } catch (e: any) {
      setError(e?.message || "Transcription failed.");
    } finally { setBusy(false); }
  };

  const download = (content: string, ext: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${fileName}.${ext}`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid">
      <div className="card">
        <div className="card-head"><h2>1. Audio file</h2></div>

        <label className={busy ? "btn ghost disabled block" : "btn primary block"}>
          {busy ? `Working... ${progress}%` : "Choose audio (mp3, m4a, wav, ogg, webm...)"}
          <input type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm,.flac,.aac" hidden disabled={busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) run(f); e.target.value = ""; }} />
        </label>

        <div style={{ height: 14 }} />

        <label className="field">
          <span>Engine</span>
          <select value={engine} onChange={(e) => setEngine(e.target.value as Engine)} disabled={busy}>
            <option value="local">On-device - Whisper in-browser (no key)</option>
            <option value="openai">Cloud - OpenAI (needs API key)</option>
            <option value="elevenlabs">Cloud - ElevenLabs (needs API key)</option>
          </select>
        </label>

        {engine === "local" && (
          <label className="field">
            <span>Model (larger = more accurate, slower)</span>
            <select value={localModel} onChange={(e) => setLocalModel(e.target.value)} disabled={busy}>
              <option value="Xenova/whisper-tiny">whisper-tiny (fastest, ~40 MB)</option>
              <option value="Xenova/whisper-base">whisper-base (balanced, ~75 MB)</option>
              <option value="Xenova/whisper-small">whisper-small (best, ~250 MB)</option>
            </select>
          </label>
        )}
        {engine === "openai" && (
          <label className="field"><span>Model</span>
            <select value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)} disabled={busy || timestamps}>
              <option value="gpt-4o-transcribe">gpt-4o-transcribe</option>
              <option value="gpt-4o-mini-transcribe">gpt-4o-mini-transcribe</option>
              <option value="whisper-1">whisper-1</option>
            </select></label>
        )}

        <label className="field">
          <span>Language hint (optional, e.g. "en") - blank = auto-detect</span>
          <input type="text" value={language} onChange={(e) => setLanguage(e.target.value)} disabled={busy} placeholder="auto" />
        </label>

        {engine !== "elevenlabs" && (
          <label className="checkline">
            <input type="checkbox" checked={timestamps} onChange={(e) => setTimestamps(e.target.checked)} disabled={busy} />
            <span>Timestamps + SRT export</span>
          </label>
        )}

        {engine === "local" && <p className="hint">The Whisper model downloads once from a free public CDN, caches in your browser, then runs entirely offline. Nothing is uploaded to any server.</p>}

        {busy && engine !== "local" && <button className="btn ghost block" onClick={() => (cancelled.current = true)}>Cancel</button>}
        {busy && <div className="bar"><div className="bar-fill" style={{ width: `${progress}%` }} /></div>}
        {error && <div className="alert">{error}</div>}
        {log.length > 0 && <div className="logbox">{log.map((l, i) => <div key={i}>{l}</div>)}</div>}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>2. Transcript</h2>
          <div className="head-actions">
            <button className="btn ghost" disabled={!transcript} onClick={() => navigator.clipboard.writeText(transcript)}>Copy</button>
            <button className="btn ghost" disabled={!transcript} onClick={() => download(transcript, "txt")}>Download .txt</button>
            {srt && <button className="btn ghost" onClick={() => download(srt, "srt")}>Download .srt</button>}
          </div>
        </div>
        <textarea className="editor" placeholder="Your transcript will appear here." value={transcript} onChange={(e) => setTranscript(e.target.value)} />
        <div className="meta">{transcript ? `${transcript.trim().split(/\s+/).length.toLocaleString()} words` : "No transcript yet"}</div>
      </div>
    </div>
  );
}
