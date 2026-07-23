"use client";

import { useState } from "react";
import Converter from "@/components/Converter";
import Guide from "@/components/Guide";

type Tab = "convert" | "guide";

export default function Home() {
  const [tab, setTab] = useState<Tab>("convert");

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">A</span>
          <div>
            <h1>Listen</h1>
            <p>Turn documents into natural-sounding audio</p>
          </div>
        </div>
        <nav className="tabs">
          <button
            className={tab === "convert" ? "tab active" : "tab"}
            onClick={() => setTab("convert")}
          >
            Text to Audio
          </button>
          <button
            className={tab === "guide" ? "tab active" : "tab"}
            onClick={() => setTab("guide")}
          >
            Setup &amp; Guide
          </button>
        </nav>
      </header>

      <section className="content">
        {tab === "convert" ? <Converter /> : <Guide />}
      </section>

      <footer className="foot">
        Deployed on Vercel - audio generated with your own OpenAI / ElevenLabs key.
      </footer>
    </main>
  );
}
