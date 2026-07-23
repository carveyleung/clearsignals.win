"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeText, wordCount, estimateMinutes } from "@/lib/textNormalize";
import { chunkText } from "@/lib/chunk";
import { parseFile } from "@/lib/parsers";
import {
  systemVoicesSupported, getSystemVoices, onSystemVoices,
  speakSystem, pauseSystem, resumeSystem,
  listPiperVoices, piperStored, downloadPiperVoice, piperSynthesize, PiperVoice,
} from "@/lib/localTts";

type Engine = "system" | "piper" | "openai" | "elevenlabs";

const OPENAI_VOICES = ["alloy","ash","ballad","coral","echo","fable","onyx","nova","sage","shimmer"];
const ELEVEN_VOICES = [
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel (calm)" },
  { id: "pNInz6obpgDQGcFmaJgB", name: "Adam (deep)" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel (British)" },
];
const DEFAULT_INSTRUCTIONS =
  "Read aloud like a professional audiobook narrator with a warm, even, natural cadence. " +
  "Pause only at commas and sentence endings; never in the middle of a sentence.";

export default function Converter() {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("audio");
  const [engine, setEngine] = useState<Engine>("system");

  // system voices
  const [sysVoices, setSysVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [sysVoiceURI, setSysVoiceURI] = useState("");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);

  // piper voices
  const [piperVoices, setPiperVoices] = useState<PiperVoice[]>([]);
  const [piperVoice, setPiperVoice] = useState("en_US-hfc_female-medium");
  const [stored, setStored] = useState<string[]>([]);
  const [dlFrac, setDlFrac] = useState<number | null>(null);

  // cloud
  const [openaiVoice, setOpenaiVoice] = useState("alloy");
  const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini-tts");
  const [elevenVoice, setElevenVoice] = useState(ELEVEN_VOICES[0].id);
  const [instructions, setInstructions] = useState(DEFAULT_INSTRUCTIONS);

  const [parsing, setParsing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  const cancelled = useRef(false);
  const stopSpeak = useRef<() => void>(() => {});
  const addLog = (m: string) => setLog((l) => [...l, m]);

  // load system voices
  useEffect(() => {
    if (!systemVoicesSupported()) return;
    const off = onSystemVoices((v) => {
      setSysVoices(v);
      setSysVoiceURI((cur) => cur || v.find((x) => x.default)?.voiceURI || v[0]?.voiceURI || "");
    });
    return off;
  }, []);

  // load piper voice catalog + which are already downloaded (only when selected)
  useEffect(() => {
    if (engine !== "piper") return;
    (async () => {
      try {
        const [voices, s] = await Promise.all([listPiperVoices(), piperStored()]);
        if (voices.length) setPiperVoices(voices);
        setStored(s);
      } catch (e: any) {
        setError("Could not load the neural voice list: " + (e?.message || e));
      }
    })();
  }, [engine]);

  const onFile = useCallback(async (file: File) => {
    setError(null); setParsing(true); setLog([]);
    try {
      const { text: raw, title: t } = await parseFile(file);
      const clean = normalizeText(raw);
      if (!clean) throw new Error("No readable text was found in that file.");
      setText(clean); setTitle(t || "audio");
      addLog(`Loaded "${file.name}" - ${wordCount(clean).toLocaleString()} words.`);
    } catch (e: any) {
      setError(e?.message || "Could not read that file.");
    } finally { setParsing(false); }
  }, []);

  const sentencesFrom = (t: string) => chunkText(t, 240); // short, sentence-aligned blocks
  const blocksFrom = (t: string) => chunkText(t, 800);    // larger blocks for neural/cloud

  // ---- SYSTEM (Web Speech): plays audio, no file ----
  const playSystem = () => {
    setError(null);
    const clean = normalizeText(text);
    if (!clean.trim()) { setError("Add some text or upload a file first."); return; }
    const sentences = sentencesFrom(clean);
    setSpeaking(true); setProgress(0); setLog([]);
    stopSpeak.current = speakSystem(sentences, {
      voiceURI: sysVoiceURI, rate, pitch,
      onProgress: (d, tot) => setProgress(Math.round((d / tot) * 100)),
      onDone: () => setSpeaking(false),
      onError: (m) => { setError(m); setSpeaking(false); },
    });
  };

  // ---- PIPER / CLOUD: build a downloadable file ----
  const generateFile = async () => {
    setError(null); setAudioUrl(null); setLog([]); setProgress(0);
    const clean = normalizeText(text); setText(clean);
    if (!clean.trim()) { setError("Add some text or upload a file first."); return; }

    cancelled.current = false; setBusy(true);
    try {
      if (engine === "piper") {
        if (!stored.includes(piperVoice)) {
          addLog("Downloading voice model (one-time, then cached offline)...");
          setDlFrac(0);
          await downloadPiperVoice(piperVoice, (f) => setDlFrac(f));
          setDlFrac(null);
          setStored(await piperStored());
        }
        const blocks = blocksFrom(clean);
        addLog(`Synthesizing ${blocks.length} block(s) on-device...`);
        const blob = await piperSynthesize(blocks, piperVoice, (d, tot) => {
          setProgress(Math.round((d / tot) * 100));
          if (cancelled.current) throw new Error("Cancelled.");
        });
        setAudioUrl(URL.createObjectURL(blob));
        addLog("Done. Preview or download below.");
      } else {
        // cloud (optional): OpenAI / ElevenLabs
        const maxLen = engine === "openai" ? 3500 : 2500;
        const blocks = chunkText(clean, maxLen);
        const buffers: ArrayBuffer[] = [];
        for (let i = 0; i < blocks.length; i++) {
          if (cancelled.current) { addLog("Cancelled."); break; }
          addLog(`Cloud chunk ${i + 1}/${blocks.length}...`);
          const res = await fetch("/api/tts", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: blocks[i], provider: engine,
              voice: engine === "openai" ? openaiVoice : elevenVoice,
              model: engine === "openai" ? openaiModel : "eleven_multilingual_v2",
              instructions,
            }),
          });
          if (!res.ok) { const j = await res.json().catch(() => ({error: res.statusText})); throw new Error(j.error); }
          buffers.push(await res.arrayBuffer());
          setProgress(Math.round(((i + 1) / blocks.length) * 100));
        }
        if (buffers.length && !cancelled.current) {
          setAudioUrl(URL.createObjectURL(new Blob(buffers, { type: "audio/mpeg" })));
          addLog("Done.");
        }
      }
    } catch (e: any) {
      setError(e?.message || "Generation failed.");
    } finally { setBusy(false); }
  };

  const minutes = estimateMinutes(text);
  const ext = engine === "piper" ? "wav" : "mp3";

  return (
    <div className="grid">
      {/* LEFT: source */}
      <div className="card">
        <div className="card-head">
          <h2>1. Source</h2>
          <div className="head-actions">
            <label className={parsing ? "btn ghost disabled" : "btn ghost"}>
              {parsing ? "Reading..." : "Upload .txt / .pdf / .epub"}
              <input type="file" accept=".txt,.md,.pdf,.epub" hidden disabled={parsing || busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
            </label>
            <button className="btn ghost" onClick={() => setText((t) => normalizeText(t))} disabled={busy}>Clean text</button>
          </div>
        </div>
        <textarea className="editor" placeholder="Paste text, or upload a .txt / .pdf / .epub. Edit before generating."
          value={text} onChange={(e) => setText(e.target.value)} disabled={busy} />
        <div className="meta">{wordCount(text).toLocaleString()} words - est. {minutes < 1 ? "<1" : Math.round(minutes)} min</div>
      </div>

      {/* RIGHT: engine + output */}
      <div className="card">
        <div className="card-head"><h2>2. Voice engine</h2></div>

        <label className="field">
          <span>Engine</span>
          <select value={engine} onChange={(e) => setEngine(e.target.value as Engine)} disabled={busy || speaking}>
            <option value="system">On-device - system voices (instant, no download)</option>
            <option value="piper">On-device - Piper neural (downloadable file)</option>
            <option value="openai">Cloud - OpenAI (needs API key)</option>
            <option value="elevenlabs">Cloud - ElevenLabs (needs API key)</option>
          </select>
        </label>

        {engine === "system" && (
          systemVoicesSupported() ? (
            <>
              <label className="field">
                <span>Voice ({sysVoices.length} installed on your device)</span>
                <select value={sysVoiceURI} onChange={(e) => setSysVoiceURI(e.target.value)} disabled={speaking}>
                  {sysVoices.map((v) => (
                    <option key={v.voiceURI} value={v.voiceURI}>{v.name} - {v.lang}{v.localService ? "" : " (network)"}</option>
                  ))}
                </select>
              </label>
              <label className="field"><span>Rate: {rate.toFixed(2)}x</span>
                <input type="range" min={0.6} max={1.6} step={0.05} value={rate} onChange={(e) => setRate(parseFloat(e.target.value))} disabled={speaking} /></label>
              <label className="field"><span>Pitch: {pitch.toFixed(2)}</span>
                <input type="range" min={0.5} max={1.5} step={0.05} value={pitch} onChange={(e) => setPitch(parseFloat(e.target.value))} disabled={speaking} /></label>
              {!speaking ? (
                <button className="btn primary block" onClick={playSystem} disabled={busy}>Play</button>
              ) : (
                <div className="row">
                  <button className="btn ghost" onClick={() => pauseSystem()}>Pause</button>
                  <button className="btn ghost" onClick={() => resumeSystem()}>Resume</button>
                  <button className="btn ghost" onClick={() => { stopSpeak.current(); setSpeaking(false); }}>Stop</button>
                </div>
              )}
              <p className="hint">System voices play instantly and never leave your device. For a downloadable file, use the Piper engine.</p>
            </>
          ) : <div className="alert">Your browser does not support built-in speech. Use the Piper engine instead.</div>
        )}

        {engine === "piper" && (
          <>
            <label className="field">
              <span>Neural voice</span>
              <select value={piperVoice} onChange={(e) => setPiperVoice(e.target.value)} disabled={busy}>
                {(piperVoices.length ? piperVoices.map((v) => ({ key: v.key, label: `${v.name}${v.language ? " - " + v.language : ""}${stored.includes(v.key) ? " [downloaded]" : ""}` }))
                  : [{ key: "en_US-hfc_female-medium", label: "en_US-hfc_female-medium" },
                     { key: "en_US-amy-medium", label: "en_US-amy-medium" },
                     { key: "en_GB-alan-medium", label: "en_GB-alan-medium" }]
                ).map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </label>
            {dlFrac !== null && <div className="bar"><div className="bar-fill" style={{ width: `${Math.round(dlFrac * 100)}%` }} /></div>}
            <button className="btn primary block" onClick={generateFile} disabled={busy}>{busy ? `Generating... ${progress}%` : "Generate audio"}</button>
            <p className="hint">First use of a voice downloads its model once (from a free public CDN) and caches it in your browser; after that it runs fully offline.</p>
          </>
        )}

        {(engine === "openai" || engine === "elevenlabs") && (
          <>
            {engine === "openai" ? (
              <>
                <label className="field"><span>Model</span>
                  <select value={openaiModel} onChange={(e) => setOpenaiModel(e.target.value)} disabled={busy}>
                    <option value="gpt-4o-mini-tts">gpt-4o-mini-tts</option>
                    <option value="tts-1-hd">tts-1-hd</option>
                    <option value="tts-1">tts-1</option>
                  </select></label>
                <label className="field"><span>Voice</span>
                  <select value={openaiVoice} onChange={(e) => setOpenaiVoice(e.target.value)} disabled={busy}>
                    {OPENAI_VOICES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select></label>
              </>
            ) : (
              <label className="field"><span>Voice</span>
                <select value={elevenVoice} onChange={(e) => setElevenVoice(e.target.value)} disabled={busy}>
                  {ELEVEN_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select></label>
            )}
            <button className="btn primary block" onClick={generateFile} disabled={busy}>{busy ? `Generating... ${progress}%` : "Generate audio"}</button>
            <p className="hint">Cloud engines require the matching API key in your Vercel environment variables. They are optional - the on-device engines need no key.</p>
          </>
        )}

        {busy && <><div className="bar"><div className="bar-fill" style={{ width: `${progress}%` }} /></div>
          <button className="btn ghost block" onClick={() => (cancelled.current = true)}>Cancel</button></>}

        {error && <div className="alert">{error}</div>}

        {audioUrl && (
          <div className="output">
            <audio controls src={audioUrl} style={{ width: "100%" }} />
            <a className="btn primary block" href={audioUrl} download={`${title || "audio"}.${ext}`}>Download {ext.toUpperCase()}</a>
          </div>
        )}

        {log.length > 0 && <div className="logbox">{log.map((l, i) => <div key={i}>{l}</div>)}</div>}
      </div>
    </div>
  );
}
